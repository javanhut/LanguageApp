const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { translateText, generateSpeech } = require('./translation');

// Simple in-memory cache for content and state
const DATA_DIR = path.join(__dirname, 'data');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Ensure data directories exist
fs.mkdirSync(CONTENT_DIR, { recursive: true });

// Utility: read JSON file safely
function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// Utility: write JSON atomically
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Load content files
function loadAllContent() {
  const subjects = [];
  const items = {};
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const full = path.join(CONTENT_DIR, f);
    const content = readJson(full, null);
    if (!content) continue;
    
    // Handle structured courses with lessons
    if (content.lessons && Array.isArray(content.lessons)) {
      const courseId = content.id || path.basename(f, '.json');
      
      // Create a subject for each lesson
      content.lessons.forEach((lesson, lessonIndex) => {
        const lessonId = `${courseId}::${lesson.id}`;
        const lessonSubject = {
          id: lessonId,
          title: `${content.title} - ${lesson.title}`,
          track: content.track || 'misc',
          description: lesson.grammar || content.description || '',
          langFrom: content.langFrom || null,
          langTo: content.langTo || null,
          count: lesson.items ? lesson.items.length : 0,
          courseId: courseId,
          lessonNumber: lessonIndex + 1,
          vocabulary: lesson.vocabulary || [],
          grammar: lesson.grammar || ''
        };
        subjects.push(lessonSubject);
        
        // Add lesson items
        if (Array.isArray(lesson.items)) {
          for (let i = 0; i < lesson.items.length; i++) {
            const it = lesson.items[i];
            const itemId = `${lessonId}::${it.id || i}`;
            items[itemId] = {
              ...it,
              id: itemId,
              subjectId: lessonId,
              track: content.track || 'misc',
              lessonNumber: lessonIndex + 1
            };
          }
        }
      });
    } else {
      // Handle regular content files
      const subjectId = content.id || path.basename(f, '.json');
      const subject = {
        id: subjectId,
        title: content.title || subjectId,
        track: content.track || 'misc',
        description: content.description || '',
        langFrom: content.langFrom || null,
        langTo: content.langTo || null,
        count: Array.isArray(content.items) ? content.items.length : 0,
      };
      subjects.push(subject);
      if (Array.isArray(content.items)) {
        for (let i = 0; i < content.items.length; i++) {
          const it = content.items[i];
          const itemId = `${subjectId}::${it.id || i}`;
          items[itemId] = {
            ...it,
            id: itemId,
            subjectId,
            track: subject.track,
          };
        }
      }
    }
  }
  return { subjects, items };
}

let { subjects, items } = loadAllContent();

// Load state
const defaultState = {
  user: {
    id: 'local-user',
    name: 'Player 1',
    displayName: null, // User's actual name
    gender: null, // 'male', 'female', 'neutral', or null
    isProfileComplete: false,
    xp: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    badges: [],
    preferences: { track: null, subjectId: null },
  },
  srs: {}, // itemId -> {EF, intervalDays, reps, lapses, due, last, streak}
  progress: {}, // subjectId -> {correct, attempts}
  lessonProgress: {}, // courseId -> {completedLessons: [lessonNumbers], unlockedLessons: [lessonNumbers]}
  assessmentState: {}, // subjectId -> {isInAssessment: boolean, assessmentAttempts: number, assessmentCorrect: number}
  log: [],
};

let state = readJson(STATE_FILE, defaultState);

// Create state.json from template if it doesn't exist (first run privacy protection)
if (!fs.existsSync(STATE_FILE)) {
  console.log('ℹ️ Creating user data file from template (first run)');
  writeJson(STATE_FILE, defaultState);
}

function saveState() {
  writeJson(STATE_FILE, state);
}

// Date helpers
function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Leveling system
function xpForNextLevel(level) {
  // Quadratic growth: base 100, +25% per level
  return Math.floor(100 * Math.pow(1.25, level - 1));
}

function addXP(amount) {
  state.user.xp += amount;
  let next = xpForNextLevel(state.user.level);
  while (state.user.xp >= next) {
    state.user.xp -= next;
    state.user.level += 1;
    awardBadge(`Level ${state.user.level}`);
    next = xpForNextLevel(state.user.level);
  }
}

function awardBadge(name) {
  if (!state.user.badges.includes(name)) {
    state.user.badges.push(name);
  }
}

function updateStreak() {
  const last = state.user.lastActiveDate ? new Date(state.user.lastActiveDate) : null;
  const now = new Date();
  const today = startOfDay(now.getTime());
  if (!last) {
    state.user.streak = 1;
  } else {
    const lastDay = startOfDay(last.getTime());
    const diffDays = Math.round((today - lastDay) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      // same day, unchanged
    } else if (diffDays === 1) {
      state.user.streak += 1;
      if (state.user.streak === 3) awardBadge('3-day Streak');
      if (state.user.streak === 7) awardBadge('7-day Streak');
    } else if (diffDays > 1) {
      state.user.streak = 1;
    }
  }
  state.user.lastActiveDate = new Date(today).toISOString();
}

// Simplified SM-2 SRS
function ensureSrs(itemId) {
  if (!state.srs[itemId]) {
    state.srs[itemId] = {
      EF: 2.5,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
      due: Date.now(),
      last: null,
      streak: 0,
    };
  }
  return state.srs[itemId];
}

function schedule(itemId, correct) {
  const s = ensureSrs(itemId);
  const now = Date.now();
  if (correct) {
    s.reps += 1;
    s.streak = (s.streak || 0) + 1;
    // quality score q=5 for correct
    const q = 5;
    s.EF = Math.max(1.3, s.EF - 0.8 + 0.28 * q - 0.02 * q * q);
    if (s.reps === 1) s.intervalDays = 1;
    else if (s.reps === 2) s.intervalDays = 6;
    else s.intervalDays = Math.ceil(s.intervalDays * s.EF);
  } else {
    // quality score q=2 for incorrect
    const q = 2;
    s.EF = Math.max(1.3, s.EF - 0.8 + 0.28 * q - 0.02 * q * q);
    s.reps = 0;
    s.lapses += 1;
    s.streak = 0;
    s.intervalDays = 0; // immediate review
  }
  s.last = now;
  s.due = now + s.intervalDays * 24 * 60 * 60 * 1000;
}

function getSubjectItems(subjectId) {
  return Object.values(items)
    .filter(i => i.subjectId === subjectId)
    .sort((a, b) => {
      // Sort by item ID to maintain lesson order (l1_1, l1_2, etc.)
      const aNum = parseInt(a.id.split('_').pop()) || 0;
      const bNum = parseInt(b.id.split('_').pop()) || 0;
      return aNum - bNum;
    });
}

function getNextItem(subjectId, mode = 'review') {
  const pool = getSubjectItems(subjectId);
  if (pool.length === 0) return null;
  
  // Ensure assessmentState exists
  if (!state.assessmentState) state.assessmentState = {};
  const assessment = state.assessmentState[subjectId];
  
  // If in assessment mode, return random items from the lesson
  if (assessment && assessment.isInAssessment) {
    // Filter to items that have been seen at least once
    const reviewPool = pool.filter(it => state.srs[it.id] && state.srs[it.id].reps > 0);
    if (reviewPool.length > 0) {
      // Select random item for assessment
      const randomIndex = Math.floor(Math.random() * reviewPool.length);
      return {
        ...reviewPool[randomIndex],
        mode: 'assessment',
        isAssessment: true
      };
    } else {
      // If no items have been seen, use any item
      const randomIndex = Math.floor(Math.random() * pool.length);
      return {
        ...pool[randomIndex],
        mode: 'assessment',
        isAssessment: true
      };
    }
  }
  
  if (mode === 'learn') {
    // For learning mode, prioritize completely new items
    const unseen = pool.filter(it => !state.srs[it.id] || state.srs[it.id].reps === 0 && state.srs[it.id].last === null);
    if (unseen.length > 0) {
      const item = unseen[0];
      // Add teaching metadata
      return {
        ...item,
        mode: 'learn',
        isNew: true
      };
    }
  }
  
  if (mode === 'practice') {
    // For practice mode, focus on items seen once but not mastered
    const practice = pool
      .map(it => ({ it, s: ensureSrs(it.id) }))
      .filter(({ s, it }) => s && s.reps > 0 && s.reps < 3)
      .sort((a, b) => a.s.last - b.s.last);
    if (practice.length > 0) {
      return {
        ...practice[0].it,
        mode: 'practice'
      };
    }
  }
  
  // Default review mode - existing logic
  const now = Date.now();
  const due = pool
    .map(it => ({ it, s: ensureSrs(it.id) }))
    .filter(({ s }) => s.due <= now)
    .sort((a, b) => a.s.due - b.s.due);
  if (due.length > 0) return { ...due[0].it, mode: 'review' };
  
  // Otherwise unseen items
  const unseen = pool.filter(it => !state.srs[it.id] || state.srs[it.id].reps === 0 && state.srs[it.id].last === null);
  if (unseen.length > 0) return { ...unseen[0], mode: 'learn', isNew: true };
  
  // Otherwise the one due soonest
  const soonest = pool
    .map(it => ({ it, s: ensureSrs(it.id) }))
    .sort((a, b) => a.s.due - b.s.due);
  return { ...soonest[0].it, mode: 'review' };
}

function updateProgress(subjectId, correct) {
  if (!state.progress[subjectId]) state.progress[subjectId] = { correct: 0, attempts: 0 };
  state.progress[subjectId].attempts += 1;
  if (correct) state.progress[subjectId].correct += 1;
}

function updateVocabularyProgress(subjectId, word, correct) {
  if (!state.vocabularyProgress) state.vocabularyProgress = {};
  if (!state.vocabularyProgress[subjectId]) {
    state.vocabularyProgress[subjectId] = {};
  }
  
  if (!state.vocabularyProgress[subjectId][word]) {
    state.vocabularyProgress[subjectId][word] = {
      attempts: 0,
      correct: 0,
      mastered: false,
      firstSeen: Date.now(),
      lastSeen: Date.now()
    };
  }
  
  const vocab = state.vocabularyProgress[subjectId][word];
  vocab.attempts += 1;
  if (correct) vocab.correct += 1;
  vocab.lastSeen = Date.now();
  
  // Consider word mastered if 80% accuracy with at least 3 attempts
  vocab.mastered = vocab.attempts >= 3 && (vocab.correct / vocab.attempts) >= 0.8;
}

function getVocabularyMastery(subjectId) {
  if (!state.vocabularyProgress) state.vocabularyProgress = {};
  const vocab = state.vocabularyProgress[subjectId] || {};
  const words = Object.keys(vocab);
  if (words.length === 0) return { mastered: 0, total: 0, percentage: 0 };
  
  const mastered = words.filter(word => vocab[word].mastered).length;
  const total = words.length;
  const percentage = Math.round((mastered / total) * 100);
  
  return { mastered, total, percentage };
}

function checkVocabularyReadyForNextLesson(subjectId, requiredMastery = 8) {
  if (!state.vocabularyProgress) state.vocabularyProgress = {};
  const vocab = state.vocabularyProgress[subjectId] || {};
  const masteredWords = Object.keys(vocab).filter(word => vocab[word].mastered);
  return masteredWords.length >= requiredMastery;
}

function checkLessonReadyForAssessment(subjectId) {
  const subject = subjects.find(s => s.id === subjectId);
  if (!subject || !subject.courseId) return false;
  
  const subjectItems = getSubjectItems(subjectId);
  if (subjectItems.length === 0) return false;
  
  // Check if ALL items have been seen at least once (taught)
  const allItemsSeen = subjectItems.every(item => {
    const srs = state.srs[item.id];
    return srs && (srs.reps > 0 || srs.last !== null);
  });
  
  if (!allItemsSeen) return false;
  
  // Then check if we have good progress and not already in assessment
  const progress = state.progress[subjectId];
  if (progress && subjectItems.length > 0) {
    const completionRate = progress.correct / subjectItems.length;
    if (!state.assessmentState) state.assessmentState = {};
    const assessment = state.assessmentState[subjectId];
    return completionRate >= 0.8 && (!assessment || !assessment.isInAssessment);
  }
  return false;
}

function startLessonAssessment(subjectId) {
  if (!state.assessmentState[subjectId]) {
    state.assessmentState[subjectId] = {
      isInAssessment: true,
      assessmentAttempts: 0,
      assessmentCorrect: 0,
      startTime: Date.now()
    };
  } else {
    state.assessmentState[subjectId].isInAssessment = true;
    state.assessmentState[subjectId].assessmentAttempts = 0;
    state.assessmentState[subjectId].assessmentCorrect = 0;
    state.assessmentState[subjectId].startTime = Date.now();
  }
}

function checkLessonCompletion(subjectId) {
  const subject = subjects.find(s => s.id === subjectId);
  if (!subject || !subject.courseId) return false;
  
  const assessment = state.assessmentState[subjectId];
  if (!assessment || !assessment.isInAssessment) return false;
  
  // Final assessment: need 80% success rate with at least 5 questions
  if (assessment.assessmentAttempts >= 5) {
    const assessmentRate = assessment.assessmentCorrect / assessment.assessmentAttempts;
    if (assessmentRate >= 0.8) {
      // Mark assessment as completed
      assessment.isInAssessment = false;
      return true;
    }
  }
  
  return false;
}

function unlockNextLesson(courseId, lessonNumber) {
  if (!state.lessonProgress[courseId]) {
    state.lessonProgress[courseId] = { completedLessons: [], unlockedLessons: [1] };
  }
  
  const progress = state.lessonProgress[courseId];
  
  // Mark current lesson as completed
  if (!progress.completedLessons.includes(lessonNumber)) {
    progress.completedLessons.push(lessonNumber);
  }
  
  // Unlock next lesson
  const nextLesson = lessonNumber + 1;
  if (!progress.unlockedLessons.includes(nextLesson)) {
    progress.unlockedLessons.push(nextLesson);
  }
}

function isLessonUnlocked(courseId, lessonNumber) {
  if (!state.lessonProgress[courseId]) {
    // First lesson is always unlocked
    state.lessonProgress[courseId] = { completedLessons: [], unlockedLessons: [1] };
    return lessonNumber === 1;
  }
  
  return state.lessonProgress[courseId].unlockedLessons.includes(lessonNumber);
}

function logEvent(type, payload) {
  state.log.push({ ts: Date.now(), type, ...payload });
  if (state.log.length > 1000) state.log.shift();
}

// Static server
const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  
  // Handle root path
  if (reqPath === '/') reqPath = '/index.html';
  
  const filePath = path.join(PUBLIC_DIR, reqPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // For client-side routing, serve index.html for non-file requests
      const isFileRequest = path.extname(reqPath) !== '';
      if (!isFileRequest) {
        // This is likely a client-side route, serve index.html
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(indexData);
        });
        return;
      }
      
      res.writeHead(404);
      return res.end('Not found');
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const type = (
      ext === '.html' ? 'text/html' :
      ext === '.css' ? 'text/css' :
      ext === '.js' ? 'application/javascript' :
      ext === '.json' ? 'application/json' :
      'application/octet-stream'
    );
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

// JSON helpers
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// API routing
async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname, searchParams } = url;

  // Refresh content if any new files appeared
  if (pathname === '/api/catalog' && req.method === 'GET') {
    ({ subjects, items } = loadAllContent());
    return json(res, 200, { subjects });
  }

  if (pathname === '/api/user' && req.method === 'GET') {
    return json(res, 200, { user: state.user });
  }

  if (pathname === '/api/env' && req.method === 'GET') {
    const env = process.env.NODE_ENV || 'production';
    return json(res, 200, { env });
  }

  if (pathname === '/api/user' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      state.user = { ...state.user, ...body };
      saveState();
      return json(res, 200, { ok: true, user: state.user });
    } catch (e) {
      return json(res, 400, { error: 'Invalid JSON' });
    }
  }

  if (pathname === '/api/stats' && req.method === 'GET') {
    const subjectId = searchParams.get('subjectId') || state.user.preferences.subjectId;
    const prog = subjectId ? state.progress[subjectId] || { correct: 0, attempts: 0 } : null;
    return json(res, 200, {
      user: state.user,
      progress: prog,
      badges: state.user.badges,
    });
  }

  if (pathname === '/api/lesson-progress' && req.method === 'GET') {
    const courseId = searchParams.get('courseId');
    if (!courseId) return json(res, 400, { error: 'courseId required' });
    
    // Ensure lessonProgress exists
    if (!state.lessonProgress) {
      state.lessonProgress = {};
    }
    
    const progress = state.lessonProgress[courseId] || { completedLessons: [], unlockedLessons: [1] };
    return json(res, 200, { progress });
  }

  if (pathname === '/api/items/next' && req.method === 'GET') {
    const subjectId = searchParams.get('subjectId') || state.user.preferences.subjectId;
    const mode = searchParams.get('mode') || 'review';
    if (!subjectId) return json(res, 400, { error: 'subjectId required' });
    const it = getNextItem(subjectId, mode);
    if (!it) return json(res, 404, { error: 'No items' });
    const s = ensureSrs(it.id);
    return json(res, 200, { item: {
      id: it.id,
      subjectId: it.subjectId,
      track: it.track,
      type: it.type,
      prompt: it.prompt,
      answer: it.answer,
      choices: it.choices || null,
      hints: it.hints || null,
      data: it.data || null,
      due: s.due,
      mode: it.mode || 'review',
      isNew: it.isNew || false,
      isAssessment: it.isAssessment || false,
    }});
  }

  if (pathname === '/api/submit' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { itemId, response, hintUsed } = body;
      if (!itemId) return json(res, 400, { error: 'itemId required' });
      const it = items[itemId];
      if (!it) return json(res, 404, { error: 'Unknown item' });
      const normalized = (v) => ('' + v).trim().toLowerCase();
      let correct = false;
      
      // Helper function to replace dynamic placeholders
      function processDynamicAnswer(answer) {
        if (typeof answer !== 'string') return answer;
        return answer.replace(/\{\{user\.name\}\}/g, state.user.displayName || state.user.name || 'Player 1')
                    .replace(/\{\{user\.displayName\}\}/g, state.user.displayName || state.user.name || 'Player 1');
      }
      
      if (it.type === 'mcq') {
        correct = response === it.answer;
      } else if (it.type === 'input' || it.type === 'listen' || it.type === 'graph') {
        const answers = Array.isArray(it.answer) ? it.answer : [it.answer];
        const processedAnswers = answers.map(processDynamicAnswer);
        correct = processedAnswers.map(normalized).includes(normalized(response));
      } else if (it.type === 'code') {
        const src = (response || '').toString();
        // If JavaScript tests provided, evaluate in VM
        if (it.lang === 'javascript' && it.tests && it.tests.entry && Array.isArray(it.tests.cases)) {
          try {
            correct = runJsTests(src, it.tests);
          } catch (e) {
            correct = false;
          }
        } else if (Array.isArray(it.checkTokens)) {
          correct = it.checkTokens.every(tok => src.includes(tok));
        } else {
          correct = !!response; // accept any non-empty for now
        }
      }

      schedule(itemId, !!correct);
      updateProgress(it.subjectId, !!correct);
      updateStreak();
      
      // Track vocabulary progress
      if (it.newWord) {
        updateVocabularyProgress(it.subjectId, it.newWord, !!correct);
      }
      
      // Track assessment progress if in assessment mode
      if (!state.assessmentState) state.assessmentState = {};
      const assessment = state.assessmentState[it.subjectId];
      if (assessment && assessment.isInAssessment) {
        assessment.assessmentAttempts += 1;
        if (correct) assessment.assessmentCorrect += 1;
      }
      
      // Only award XP if hint was not used
      if (!hintUsed) {
        if (correct) {
          addXP(10);
          if (state.progress[it.subjectId].correct === 10) awardBadge('First 10 Correct');
          if (it.track === 'spoken') awardBadge('Polyglot Beginner');
          if (it.track === 'programming') awardBadge('Coder Beginner');
        } else {
          // Small consolation XP to reduce frustration
          addXP(2);
        }
      }
      
      // Check lesson states
      let lessonCompleted = false;
      let assessmentStarted = false;
      const subject = subjects.find(s => s.id === it.subjectId);
      
      if (subject && subject.courseId) {
        // Check if lesson is completed (after assessment)
        if (checkLessonCompletion(it.subjectId)) {
          unlockNextLesson(subject.courseId, subject.lessonNumber);
          lessonCompleted = true;
        }
        // Check if ready for assessment (80% completion reached)
        else if (checkLessonReadyForAssessment(it.subjectId)) {
          startLessonAssessment(it.subjectId);
          assessmentStarted = true;
        }
      }
      
      logEvent('answer', { itemId, subjectId: it.subjectId, correct: !!correct });
      saveState();
      // Process answer for display (replace placeholders)
      const displayAnswer = Array.isArray(it.answer) ? 
        it.answer.map(processDynamicAnswer) : 
        processDynamicAnswer(it.answer);
      
      const responseData = { 
        correct: !!correct, 
        answer: displayAnswer, 
        user: state.user,
        lessonCompleted,
        assessmentStarted
      };
      
      // Add assessment progress if in assessment mode
      if (assessment && assessment.isInAssessment) {
        responseData.assessmentProgress = {
          attempts: assessment.assessmentAttempts,
          correct: assessment.assessmentCorrect,
          successRate: assessment.assessmentAttempts > 0 ? 
            Math.round((assessment.assessmentCorrect / assessment.assessmentAttempts) * 100) : 0,
          remaining: Math.max(0, 5 - assessment.assessmentAttempts)
        };
      }
      
      return json(res, 200, responseData);
    } catch (e) {
      return json(res, 400, { error: 'Invalid JSON' });
    }
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    state = JSON.parse(JSON.stringify(defaultState));
    saveState();
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/vocabulary-progress' && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const subjectId = url.searchParams.get('subjectId');
    
    if (!subjectId) {
      return json(res, 400, { error: 'subjectId required' });
    }
    
    const mastery = getVocabularyMastery(subjectId);
    const vocab = state.vocabularyProgress[subjectId] || {};
    const readyForNext = checkVocabularyReadyForNextLesson(subjectId);
    
    return json(res, 200, {
      mastery,
      vocabulary: vocab,
      readyForNextLesson: readyForNext
    });
  }
  
  if (pathname === '/api/translate' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { text, from, to } = body;
      if (!text) return json(res, 400, { error: 'text required' });
      const translated = await translateText(text, from || 'en', to || 'es');
      return json(res, 200, { translated });
    } catch (e) {
      return json(res, 400, { error: 'Translation failed' });
    }
  }

  if (pathname === '/api/tts' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { text, lang } = body;
      if (!text) return json(res, 400, { error: 'text required' });
      const speech = generateSpeech(text, lang || 'en');
      return json(res, 200, speech);
    } catch (e) {
      return json(res, 400, { error: 'TTS generation failed' });
    }
  }

  json(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    return handleApi(req, res);
  }
  return serveStatic(req, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`LanguageApp server running at http://localhost:${PORT}`);
});

// --- JS code test runner (very limited, no require) ---
function runJsTests(code, tests) {
  const context = vm.createContext({ console: { log: () => {} } });
  const script = new vm.Script(String(code), { timeout: 1000 });
  script.runInContext(context, { timeout: 1000 });
  const entry = tests.entry;
  const fn = context[entry];
  if (typeof fn !== 'function') throw new Error('Entry function not found');
  for (const t of tests.cases) {
    const got = fn.apply(null, t.args);
    if (!deepEqual(got, t.expect)) {
      return false;
    }
  }
  return true;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}
