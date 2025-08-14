(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    catalog: [],
    user: null,
    currentTrack: 'spoken',
    subjectId: null,
    currentItem: null,
    progress: { correct: 0, attempts: 0 },
    hintUsed: false,
    currentLanguage: null,
    currentCourse: null,
    lessonProgress: null,
    currentMode: 'learn',
    isTeaching: false,
  };

  // UI helpers
  function setText(id, text) { const el = typeof id === 'string' ? $(id) : id; if (el) el.textContent = text; }
  function showToast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 1500); }
  function switchView(name) {
    $$('.view').forEach(v => v.classList.add('hidden'));
    $(`#view-${name}`).classList.remove('hidden');
    $$('.nav').forEach(n => n.classList.toggle('active', n.dataset.nav === name || (name === 'onboarding' && n.dataset.nav === 'onboarding')));
  }

  // Simple routing system
  function updateURL(path) {
    window.history.pushState({}, '', path);
  }

  function handleRoute() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(s => s);
    
    if (segments.length === 0 || (segments.length === 1 && segments[0] === 'home')) {
      // Home page (both / and /home)
      renderLanguages();
      switchView('onboarding');
      return true; // Indicate route was handled
    } else if (segments.length === 1) {
      // Language page (e.g., /portuguese)
      const langName = segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
      const languages = groupByLanguage(state.catalog);
      if (languages[langName]) {
        selectLanguage(langName, languages[langName]);
        return true; // Indicate route was handled
      } else {
        // Fallback to home
        renderLanguages();
        switchView('onboarding');
        updateURL('/home');
        return true;
      }
    } else if (segments.length === 2 && segments[1] === 'lesson') {
      // Lesson list for language (e.g., /portuguese/lessons)
      const langName = segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
      const languages = groupByLanguage(state.catalog);
      if (languages[langName]) {
        selectLanguage(langName, languages[langName]);
        return true; // Indicate route was handled
      }
    }
    
    // If no route handled, go to home
    renderLanguages();
    switchView('onboarding');
    updateURL('/home');
    return false;
  }

  // API helpers
  async function api(path, options = {}) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }

  // Translation helper
  async function translateText(text, from = 'en', to = 'es') {
    try {
      const res = await api('/api/translate', { 
        method: 'POST', 
        body: JSON.stringify({ text, from, to }) 
      });
      return res.translated || text;
    } catch (e) {
      console.error('Translation failed:', e);
      return text;
    }
  }

  async function loadCatalog() {
    const { subjects } = await api('/api/catalog');
    state.catalog = subjects;
  }

  async function loadUser() {
    const { user } = await api('/api/user');
    state.user = user;
    renderTopStats();
  }

  async function setEnvBadge() {
    try {
      const { env } = await api('/api/env');
      const badge = document.getElementById('env-badge');
      const wm = document.getElementById('dev-watermark');
      if (env && env.toLowerCase() === 'development') {
        badge.classList.remove('hidden');
        badge.textContent = 'DEV';
        wm.classList.remove('hidden');
        document.body.classList.add('dev');
      } else {
        badge.classList.add('hidden');
        wm.classList.add('hidden');
        document.body.classList.remove('dev');
      }
    } catch (_) { /* ignore */ }
  }

  function renderTopStats() {
    setText('#level', `Lvl ${state.user.level}`);
    setText('#xp', `${state.user.xp} XP`);
    setText('#streak', `🔥 ${state.user.streak}`);
    setText('#stat-level', `${state.user.level}`);
    setText('#stat-xp', `${state.user.xp}`);
    setText('#stat-streak', `${state.user.streak}`);
  }

  function groupByLanguage(subjects) {
    const languages = {};
    subjects.forEach(s => {
      if (s.track === 'spoken') {
        // Extract language from title or use langTo
        let language = 'Other';
        const title = s.title.toLowerCase();
        
        if (title.includes('portuguese') || title.includes('brasil') || s.langTo === 'pt') {
          language = 'Portuguese';
        } else if (title.includes('spanish') || s.langTo === 'es') {
          language = 'Spanish';
        } else if (title.includes('french') || s.langTo === 'fr') {
          language = 'French';
        } else if (title.includes('german') || s.langTo === 'de') {
          language = 'German';
        } else if (title.includes('italian') || s.langTo === 'it') {
          language = 'Italian';
        }
        
        if (!languages[language]) {
          languages[language] = [];
        }
        languages[language].push(s);
      }
    });
    return languages;
  }

  function renderLanguages() {
    const container = $('#language-grid');
    container.innerHTML = '';
    const languages = groupByLanguage(state.catalog);
    
    for (const [langName, subjects] of Object.entries(languages)) {
      const div = document.createElement('div');
      div.className = 'language-card';
      
      // Count total lessons
      const totalLessons = subjects.reduce((sum, s) => sum + (s.count || 0), 0);
      
      // Get flag emoji
      const flags = {
        'Portuguese': '🇧🇷',
        'Spanish': '🇪🇸', 
        'French': '🇫🇷',
        'German': '🇩🇪',
        'Italian': '🇮🇹'
      };
      
      div.innerHTML = `
        <div class="flag">${flags[langName] || '🌍'}</div>
        <div class="lang-name">${langName}</div>
        <div class="lang-count">${subjects.length} courses, ${totalLessons} lessons</div>
      `;
      div.addEventListener('click', () => selectLanguage(langName, subjects));
      container.appendChild(div);
    }
  }

  function selectLanguage(langName, subjects) {
    state.currentLanguage = langName;
    state.currentCourse = subjects.find(s => s.courseId)?.courseId || null;
    $('#language-title').textContent = `${langName} Lessons`;
    renderLessons(subjects);
    switchView('language-lessons');
    updateURL(`/${langName.toLowerCase()}`);
  }

  async function renderLessons(subjects) {
    const container = $('#lessons');
    container.innerHTML = '';
    
    // Get lesson progress if we have a course
    let lessonProgress = null;
    if (state.currentCourse) {
      try {
        const res = await api(`/api/lesson-progress?courseId=${encodeURIComponent(state.currentCourse)}`);
        lessonProgress = res.progress;
        state.lessonProgress = lessonProgress;
      } catch (e) {
        console.error('Failed to load lesson progress:', e);
      }
    }
    
    for (const s of subjects) {
      const div = document.createElement('div');
      
      // Check if lesson is unlocked
      const isUnlocked = !s.lessonNumber || !lessonProgress || 
                        lessonProgress.unlockedLessons.includes(s.lessonNumber);
      const isCompleted = lessonProgress && lessonProgress.completedLessons.includes(s.lessonNumber);
      
      div.className = `subject ${!isUnlocked ? 'locked' : ''} ${isCompleted ? 'completed' : ''}`;
      
      // Extract lesson number if available
      const lessonNumber = s.lessonNumber ? `Lesson ${s.lessonNumber}` : '';
      const lockIcon = !isUnlocked ? '🔒 ' : '';
      const completedIcon = isCompleted ? '✅ ' : '';
      
      div.innerHTML = `
        <div class="track">${lockIcon}${completedIcon}${lessonNumber}</div>
        <div class="title">${s.title}</div>
        <div class="desc">${s.description || s.grammar || ''}</div>
        <div class="desc">Items: ${s.count}</div>
      `;
      
      if (isUnlocked) {
        div.addEventListener('click', () => selectSubject(s.id));
      } else {
        div.style.opacity = '0.5';
        div.style.cursor = 'not-allowed';
        div.addEventListener('click', () => {
          showToast('Complete previous lessons to unlock this one!');
        });
      }
      
      container.appendChild(div);
    }
  }

  async function selectSubject(subjectId) {
    state.subjectId = subjectId;
    await api('/api/user', { method: 'POST', body: JSON.stringify({ preferences: { track: state.currentTrack, subjectId } }) });
    const sub = state.catalog.find(s => s.id === subjectId);
    const baseTitle = sub ? sub.title : 'Practice';
    $('#subject-title').textContent = baseTitle;
    
    // Setup lesson navigation if this is part of a course
    if (sub && sub.courseId && sub.lessonNumber) {
      setupLessonNavigation(sub);
      $('#lesson-nav').classList.remove('hidden');
    } else {
      $('#lesson-nav').classList.add('hidden');
    }
    
    switchView('practice');
    nextQuestion();
  }

  function setupLessonNavigation(subject) {
    const courseSubjects = state.catalog.filter(s => s.courseId === subject.courseId);
    const currentLessonNumber = subject.lessonNumber;
    const totalLessons = Math.max(...courseSubjects.map(s => s.lessonNumber || 0));
    
    // Update lesson info
    $('#lesson-info').textContent = `Lesson ${currentLessonNumber} of ${totalLessons}`;
    
    // Setup previous button
    const prevBtn = $('#prev-lesson');
    const prevLesson = courseSubjects.find(s => s.lessonNumber === currentLessonNumber - 1);
    prevBtn.disabled = !prevLesson;
    prevBtn.onclick = () => prevLesson && selectSubject(prevLesson.id);
    
    // Setup next button
    const nextBtn = $('#next-lesson');
    const nextLesson = courseSubjects.find(s => s.lessonNumber === currentLessonNumber + 1);
    const isNextUnlocked = !nextLesson || !state.lessonProgress || 
                          state.lessonProgress.unlockedLessons.includes(nextLesson.lessonNumber);
    
    nextBtn.disabled = !nextLesson || !isNextUnlocked;
    nextBtn.onclick = () => {
      if (nextLesson && isNextUnlocked) {
        selectSubject(nextLesson.id);
      } else if (nextLesson && !isNextUnlocked) {
        showToast('Complete this lesson to unlock the next one!');
      }
    };
  }

  async function nextQuestion() {
    try {
      state.hintUsed = false; // Reset hint state for new question
      console.log('=== NEXTQUESTION DEBUG ===');
      console.log('state.subjectId:', state.subjectId);
      console.log('state.currentMode:', state.currentMode);
      
      const { item } = await api(`/api/items/next?subjectId=${encodeURIComponent(state.subjectId)}&mode=${state.currentMode}`);
      state.currentItem = personalizeQuestion(item);
      
      // Debug logging
      console.log('Item received:', item);
      console.log('Personalized item:', state.currentItem);
      console.log('Current mode:', state.currentMode);
      console.log('Is new?', state.currentItem.isNew);
      console.log('Is assessment?', state.currentItem.isAssessment);
      console.log('Should show teaching card?', state.currentItem.isNew && state.currentMode === 'learn');
      
      // Update UI for assessment mode
      if (state.currentItem.isAssessment) {
        const sub = state.catalog.find(s => s.id === state.subjectId);
        const baseTitle = sub ? sub.title : 'Practice';
        $('#subject-title').textContent = `📝 ${baseTitle} - Final Assessment`;
      }
      console.log('Teaching card element exists?', !!$('#teaching-card'));
      console.log('Answer section element exists?', !!$('#answer-section'));
      
      // Check if this is a new word that needs teaching
      if (state.currentItem.isNew && state.currentMode === 'learn') {
        console.log('>>> Calling showTeachingCard');
        showTeachingCard(state.currentItem);
      } else {
        console.log('>>> Calling showQuestion directly');
        showQuestion(state.currentItem);
      }
      
      updateStatsProgress();
    } catch (e) {
      console.error('nextQuestion error:', e);
      $('#prompt').textContent = 'No items available.';
      $('#answer-area').innerHTML = '';
      $('#hints').textContent = '';
    }
  }

  function showTeachingCard(item) {
    console.log('=== SHOWTEACHINGCARD DEBUG ===');
    console.log('item:', item);
    
    state.isTeaching = true;
    
    const teachingCard = $('#teaching-card');
    const answerSection = $('#answer-section');
    
    console.log('teachingCard element:', teachingCard);
    console.log('answerSection element:', answerSection);
    
    if (!teachingCard || !answerSection) {
      console.error('Required elements not found!');
      return;
    }
    
    teachingCard.classList.remove('hidden');
    answerSection.classList.add('hidden');
    
    console.log('teachingCard hidden class removed');
    console.log('answerSection hidden class added');
    
    // Get subject to determine languages
    const subject = state.catalog.find(s => s.id === item.subjectId);
    console.log('Found subject:', subject);
    const targetLang = subject?.langTo || 'pt';
    const nativeLang = subject?.langFrom || 'en';
    
    // Language names for display
    const langNames = {
      'pt': 'Portuguese',
      'es': 'Spanish', 
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'en': 'English'
    };
    
    const targetLangName = langNames[targetLang] || targetLang.toUpperCase();
    $('#prompt').textContent = `New ${targetLangName} Word`;
    
    // Extract target language word and English meaning
    const targetWord = Array.isArray(item.answer) ? item.answer[0] : item.answer;
    const englishMeaning = item.prompt;
    
    console.log('targetWord:', targetWord);
    console.log('englishMeaning:', englishMeaning);
    
    // Display the target language word prominently
    $('#word-display').textContent = targetWord;
    
    // Show English meaning/translation
    $('#word-meaning').textContent = `English: ${englishMeaning}`;
    
    // Enhanced pronunciation section with language context and speaker button
    const pronunciationDiv = $('#word-pronunciation');
    pronunciationDiv.innerHTML = ''; // Clear existing content
    
    // Add hints if available
    if (item.hints && item.hints.length > 0) {
      const hintsSpan = document.createElement('span');
      hintsSpan.textContent = `💡 ${item.hints.join(', ')} • `;
      hintsSpan.style.color = 'var(--muted)';
      pronunciationDiv.appendChild(hintsSpan);
    }
    
    // Create speaker button
    const speakerBtn = document.createElement('button');
    speakerBtn.innerHTML = '🔊 Listen';
    speakerBtn.className = 'speaker-btn';
    speakerBtn.style.cssText = `
      background: var(--accent);
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      margin-left: 8px;
      transition: all 0.2s ease;
    `;
    
    // Set up click handler for pronunciation
    speakerBtn.onclick = () => {
      // Determine the correct language code for TTS
      const langCodes = {
        'pt': 'pt-BR', // Brazilian Portuguese
        'es': 'es-ES', // Spanish
        'fr': 'fr-FR', // French
        'de': 'de-DE', // German
        'it': 'it-IT'  // Italian
      };
      
      const ttsLang = langCodes[targetLang] || 'pt-BR';
      console.log(`Speaking "${targetWord}" in ${ttsLang}`);
      speak(targetWord, ttsLang);
      
      // Visual feedback
      speakerBtn.style.background = 'var(--accent-2)';
      setTimeout(() => {
        speakerBtn.style.background = 'var(--accent)';
      }, 200);
    };
    
    pronunciationDiv.appendChild(speakerBtn);
    
    console.log('Teaching card content set');
    
    // Setup "Got it" button
    $('#got-it-btn').onclick = () => {
      console.log('Got it button clicked');
      state.isTeaching = false;
      $('#teaching-card').classList.add('hidden');
      $('#answer-section').classList.remove('hidden');
      showQuestion(item);
    };
    
    console.log('=== SHOWTEACHINGCARD COMPLETE ===');
  }

  function showQuestion(item) {
    $('#teaching-card').classList.add('hidden');
    $('#answer-section').classList.remove('hidden');
    renderQuestion(item);
  }

  function renderQuestion(item) {
    $('#prompt').textContent = item.prompt;
    const area = $('#answer-area');
    const hints = $('#hints');
    const helperButtons = $('#helper-buttons');
    
    hints.textContent = (item.hints && item.hints.join(' · ')) || '';
    area.innerHTML = '';
    helperButtons.innerHTML = '';

    // Setup helper buttons in the dedicated container
    setupHelperButtons(item, helperButtons, hints);
    
    // Setup accent dropdown
    setupAccentDropdown(item);

    // Render different question types
    renderQuestionType(item, area);
  }

  function setupHelperButtons(item, container, hints) {
    // TTS button for spoken items
    if (item.track === 'spoken' || (item.data && item.data.tts)) {
      const listen = document.createElement('button');
      listen.className = 'ghost';
      listen.textContent = '🔊 Listen';
      listen.addEventListener('click', () => {
        let text = (item.data && item.data.tts && item.data.tts.text) || 
                   (Array.isArray(item.answer) ? item.answer[0] : item.answer) || 
                   item.prompt || '';
        
        // Determine correct language based on subject
        const subject = state.catalog.find(s => s.id === item.subjectId);
        const targetLang = subject?.langTo || 'en';
        
        const langCodes = {
          'pt': 'pt-BR', // Brazilian Portuguese
          'es': 'es-ES', // Spanish
          'fr': 'fr-FR', // French
          'de': 'de-DE', // German
          'it': 'it-IT'  // Italian
        };
        
        let lang = (item.data && item.data.tts && item.data.tts.lang) || 
                   langCodes[targetLang] || 'en-US';
        
        console.log(`Speaking "${text}" in ${lang}`);
        speak(text, lang);
      });
      container.appendChild(listen);
    }

    // Translation button for spoken track
    if (item.track === 'spoken' && item.subjectId) {
      const translateBtn = document.createElement('button');
      translateBtn.className = 'ghost';
      translateBtn.textContent = '🌐 Translate';
      translateBtn.addEventListener('click', async () => {
        const subject = state.catalog.find(s => s.id === item.subjectId);
        const fromLang = subject?.langFrom || 'es';
        const toLang = subject?.langTo || 'en';
        const translated = await translateText(item.prompt, fromLang, toLang);
        hints.textContent = `Translation: ${translated}`;
        state.hintUsed = true;
      });
      container.appendChild(translateBtn);
    }

    // Hint button
    if (item.hints && item.hints.length > 0) {
      const hintBtn = document.createElement('button');
      hintBtn.className = 'ghost';
      hintBtn.textContent = '💡 Hint';
      hintBtn.addEventListener('click', () => {
        hints.textContent = `Hint: ${item.hints.join(' · ')}`;
        state.hintUsed = true;
        showToast('Hint used - No XP for this question');
      });
      container.appendChild(hintBtn);
    }
  }

  function setupAccentDropdown(item) {
    const dropdown = $('#accent-dropdown');
    const toggle = $('#accent-toggle');
    const menu = $('#accent-menu');
    
    if (item.track === 'spoken') {
      dropdown.classList.remove('hidden');
      
      // Get accent buttons for the current language
      const subject = state.catalog.find(s => s.id === item.subjectId);
      const langTo = subject?.langTo || 'es';
      const accentButtons = getAccentButtons(langTo, subject);
      
      // Update toggle text based on language
      toggle.textContent = getAccentToggleText(langTo);
      
      // Clear and populate menu
      menu.innerHTML = '';
      accentButtons.forEach(({ char, label }) => {
        const btn = document.createElement('button');
        btn.className = 'accent-btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
          insertAccent(char);
          menu.classList.remove('show');
        });
        menu.appendChild(btn);
      });
      
      // Toggle menu
      toggle.onclick = () => {
        menu.classList.toggle('show');
      };
      
      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
          menu.classList.remove('show');
        }
      });
    } else {
      dropdown.classList.add('hidden');
    }
  }

  function getAccentButtons(langTo, subject) {
    const subjectLower = (subject?.title || '').toLowerCase();
    
    if (langTo === 'pt' || subjectLower.includes('portug')) {
      return [
        { char: 'á', label: 'á' }, { char: 'à', label: 'à' }, { char: 'ã', label: 'ã' },
        { char: 'â', label: 'â' }, { char: 'é', label: 'é' }, { char: 'ê', label: 'ê' },
        { char: 'í', label: 'í' }, { char: 'ó', label: 'ó' }, { char: 'ô', label: 'ô' },
        { char: 'õ', label: 'õ' }, { char: 'ú', label: 'ú' }, { char: 'ç', label: 'ç' }
      ];
    } else if (langTo === 'es' || subjectLower.includes('spanish')) {
      return [
        { char: 'á', label: 'á' }, { char: 'é', label: 'é' }, { char: 'í', label: 'í' },
        { char: 'ó', label: 'ó' }, { char: 'ú', label: 'ú' }, { char: 'ñ', label: 'ñ' },
        { char: '¿', label: '¿' }, { char: '¡', label: '¡' }, { char: 'ü', label: 'ü' }
      ];
    } else if (langTo === 'fr' || subjectLower.includes('french')) {
      return [
        { char: 'à', label: 'à' }, { char: 'â', label: 'â' }, { char: 'é', label: 'é' },
        { char: 'è', label: 'è' }, { char: 'ê', label: 'ê' }, { char: 'ë', label: 'ë' },
        { char: 'î', label: 'î' }, { char: 'ï', label: 'ï' }, { char: 'ô', label: 'ô' },
        { char: 'ù', label: 'ù' }, { char: 'û', label: 'û' }, { char: 'ç', label: 'ç' }
      ];
    }
    return [];
  }

  function getAccentToggleText(langTo) {
    const labels = {
      'pt': 'á ã ç ▼',
      'es': 'á ñ ¿ ▼',
      'fr': 'é è ç ▼',
      'de': 'ä ö ü ▼',
      'it': 'à è ì ▼'
    };
    return labels[langTo] || 'á ñ ç ▼';
  }

  function insertAccent(char) {
    const input = $('#answer-area input');
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const text = input.value;
      input.value = text.substring(0, start) + char + text.substring(end);
      input.focus();
      input.selectionStart = input.selectionEnd = start + 1;
    }
  }

  function renderQuestionType(item, area) {
    if (item.type === 'mcq') {
      (item.choices || []).forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = c;
        btn.addEventListener('click', () => submitAnswer(c));
        area.appendChild(btn);
      });
    } else if (item.type === 'input' || item.type === 'listen') {
      const input = document.createElement('input');
      input.placeholder = 'Type your answer…';
      input.autofocus = true;
      input.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter') submitAnswer(input.value); 
      });
      
      const submit = document.createElement('button');
      submit.textContent = 'Check';
      submit.className = 'primary-btn';
      submit.addEventListener('click', () => submitAnswer(input.value));
      
      area.appendChild(input);
      area.appendChild(submit);
      input.focus();
    } else if (item.type === 'code') {
      const ta = document.createElement('textarea');
      ta.rows = 8;
      ta.placeholder = 'Write code here…';
      const submit = document.createElement('button');
      submit.textContent = 'Run Check';
      submit.addEventListener('click', () => submitAnswer(ta.value));
      area.appendChild(ta);
      area.appendChild(submit);
      ta.focus();
    } else if (item.type === 'graph') {
      const svg = renderGraph(item.data && item.data.graph);
      area.appendChild(svg);
      const input = document.createElement('input');
      input.placeholder = 'Enter order (e.g., A,B,C,...)';
      const submit = document.createElement('button');
      submit.textContent = 'Check';
      submit.addEventListener('click', () => submitAnswer(input.value));
      area.appendChild(input);
      area.appendChild(submit);
    }
  }

  async function submitAnswer(response) {
    if (!state.currentItem) return;
    try {
      const res = await api('/api/submit', { method: 'POST', body: JSON.stringify({ 
        itemId: state.currentItem.id, 
        response,
        hintUsed: state.hintUsed 
      }) });
      state.user = res.user;
      renderTopStats();
      
      // Show XP message based on whether hint was used
      let xpMessage;
      if (res.correct) {
        if (state.hintUsed) {
          xpMessage = 'Correct! No XP (hint used) ✅';
        } else {
          xpMessage = '+10 XP ✅';
        }
      } else {
        if (state.hintUsed) {
          xpMessage = 'Incorrect - No XP (hint used) ❌';
        } else {
          xpMessage = '+2 XP ❌';
        }
      }
      showToast(xpMessage);
      
      // Check for assessment start
      if (res.assessmentStarted) {
        showToast('📝 Lesson assessment starting! Answer 5 questions with 80% accuracy to complete.');
        setTimeout(() => nextQuestion(), 1500);
        return; // Skip normal next question flow
      }
      
      // Show assessment progress if in assessment mode
      if (res.assessmentProgress) {
        const prog = res.assessmentProgress;
        const progressMessage = `📝 Assessment: ${prog.correct}/${prog.attempts} correct (${prog.successRate}%) - ${prog.remaining} questions remaining`;
        showToast(progressMessage);
        
        // If assessment is complete but lesson not completed, user failed assessment
        if (prog.remaining === 0 && !res.lessonCompleted) {
          showToast('❌ Assessment failed. Continue practicing to try again!');
        }
      }
      
      // Check for lesson completion
      if (res.lessonCompleted) {
        showToast('🎉 Assessment passed! Lesson completed!');
        
        // Refresh lesson progress first
        if (state.currentCourse) {
          try {
            const progressRes = await api(`/api/lesson-progress?courseId=${encodeURIComponent(state.currentCourse)}`);
            state.lessonProgress = progressRes.progress;
            
            // Update navigation buttons
            const sub = state.catalog.find(s => s.id === state.subjectId);
            if (sub && sub.courseId && sub.lessonNumber) {
              setupLessonNavigation(sub);
            }
          } catch (e) {
            console.error('Failed to refresh lesson progress:', e);
          }
        }
        
        // Show completion modal with choice
        setTimeout(() => {
          showLessonCompletionModal(res.assessmentProgress);
        }, 1500);
      }
      
      // reveal correct answer briefly
      const hints = $('#hints');
      hints.textContent = res.correct ? 'Correct!' : `Answer: ${Array.isArray(res.answer) ? res.answer.join(', ') : res.answer}`;
      setTimeout(() => nextQuestion(), 600);
    } catch (e) {
      console.error(e);
    }
  }

  async function updateStatsProgress() {
    if (!state.subjectId) return;
    const { progress, badges, user } = await api(`/api/stats?subjectId=${encodeURIComponent(state.subjectId)}`);
    state.progress = progress || { correct: 0, attempts: 0 };
    setText('#stat-progress', `${Math.round(((state.progress.correct || 0) / Math.max(1, state.progress.attempts || 1)) * 100)}%`);
    const row = $('#badges');
    row.innerHTML = '';
    (badges || []).forEach(b => {
      const el = document.createElement('div');
      el.className = 'badge';
      el.textContent = b;
      row.appendChild(el);
    });
    // progress bar approximate based on attempts
    const attempts = state.progress.attempts || 0;
    const pct = Math.min(100, (attempts % 20) * 5); // cycles each 20
    $('#progress-bar').style.width = pct + '%';
  }

  // Personalization functions
  function personalizeQuestion(item) {
    if (!item) return item;
    
    const personalized = { ...item };
    const user = state.user;
    
    console.log('=== PERSONALIZING QUESTION ===');
    console.log('Original item:', item);
    console.log('User:', user);
    
    // Personalize name-based questions
    if (user.displayName) {
      // Replace generic names with user's name in prompts
      if (item.prompt) {
        personalized.prompt = item.prompt
          .replace(/my name is João/gi, `my name is ${user.displayName}`)
          .replace(/my name is Maria/gi, `my name is ${user.displayName}`)
          .replace(/me chamo João/gi, `me chamo ${user.displayName}`)
          .replace(/me chamo Maria/gi, `me chamo ${user.displayName}`)
          .replace(/meu nome é João/gi, `meu nome é ${user.displayName}`)
          .replace(/meu nome é Maria/gi, `meu nome é ${user.displayName}`);
      }
      
      // Update answers for name questions
      if (item.answer && Array.isArray(item.answer)) {
        personalized.answer = item.answer.map(ans => 
          ans.replace(/joão/gi, user.displayName.toLowerCase())
             .replace(/maria/gi, user.displayName.toLowerCase())
             .replace(/joao/gi, user.displayName.toLowerCase())
             .replace(/meu nome é joão/gi, `meu nome é ${user.displayName.toLowerCase()}`)
             .replace(/meu nome e joao/gi, `meu nome e ${user.displayName.toLowerCase()}`)
             .replace(/me chamo joão/gi, `me chamo ${user.displayName.toLowerCase()}`)
             .replace(/me chamo joao/gi, `me chamo ${user.displayName.toLowerCase()}`)
        );
      } else if (typeof item.answer === 'string') {
        personalized.answer = item.answer
          .replace(/joão/gi, user.displayName.toLowerCase())
          .replace(/maria/gi, user.displayName.toLowerCase())
          .replace(/joao/gi, user.displayName.toLowerCase())
          .replace(/meu nome é joão/gi, `meu nome é ${user.displayName.toLowerCase()}`)
          .replace(/meu nome e joao/gi, `meu nome e ${user.displayName.toLowerCase()}`)
          .replace(/me chamo joão/gi, `me chamo ${user.displayName.toLowerCase()}`)
          .replace(/me chamo joao/gi, `me chamo ${user.displayName.toLowerCase()}`);
      }
    }
    
    // Gender-based personalization for Portuguese/Spanish
    if (user.gender && (user.gender === 'male' || user.gender === 'female')) {
      // Adjust gender-specific words
      if (user.gender === 'male') {
        // Use masculine forms
        personalized.prompt = personalized.prompt
          .replace(/I am Brazilian \(female\)/gi, 'I am Brazilian (male)')
          .replace(/said by a woman/gi, 'said by a man')
          .replace(/sou brasileira/gi, 'sou brasileiro')
          .replace(/obrigada/gi, 'obrigado')
          .replace(/cansada/gi, 'cansado');
          
        if (Array.isArray(personalized.answer)) {
          personalized.answer = personalized.answer.map(ans => 
            ans.replace(/brasileira/gi, 'brasileiro')
               .replace(/obrigada/gi, 'obrigado')
               .replace(/cansada/gi, 'cansado')
          );
        }
      } else if (user.gender === 'female') {
        // Use feminine forms
        personalized.prompt = personalized.prompt
          .replace(/I am Brazilian \(male\)/gi, 'I am Brazilian (female)')
          .replace(/said by a man/gi, 'said by a woman')
          .replace(/sou brasileiro/gi, 'sou brasileira')
          .replace(/obrigado/gi, 'obrigada')
          .replace(/cansado/gi, 'cansada');
          
        if (Array.isArray(personalized.answer)) {
          personalized.answer = personalized.answer.map(ans => 
            ans.replace(/brasileiro/gi, 'brasileira')
               .replace(/obrigado/gi, 'obrigada')
               .replace(/cansado/gi, 'cansada')
          );
        }
      }
    } else if (!user.gender || user.gender === 'neutral') {
      // For neutral/no gender, show both options in hints
      if (personalized.prompt.includes('Thank you') || 
          personalized.prompt.includes('I am Brazilian') || 
          personalized.prompt.includes('I\'m tired')) {
        
        const genderHint = 'Use masculine/feminine forms based on your gender';
        if (personalized.hints) {
          personalized.hints = [...personalized.hints, genderHint];
        } else {
          personalized.hints = [genderHint];
        }
      }
    }
    
    console.log('Personalized item:', personalized);
    console.log('=== PERSONALIZATION COMPLETE ===');
    return personalized;
  }

  // Lesson completion modal
  function showLessonCompletionModal(assessmentProgress) {
    console.log('=== SHOWING LESSON COMPLETION MODAL ===');
    
    const modal = $('#lesson-completion-modal');
    const scoreEl = $('#completion-score');
    const messageEl = $('#completion-message');
    
    console.log('Modal element:', modal);
    console.log('Score element:', scoreEl);
    console.log('Message element:', messageEl);
    
    if (!modal) {
      console.error('Lesson completion modal not found!');
      return;
    }
    
    // Update score if available
    if (assessmentProgress) {
      scoreEl.textContent = `${assessmentProgress.successRate}%`;
      console.log('Set score to:', assessmentProgress.successRate + '%');
    } else {
      scoreEl.textContent = '100%';
      console.log('Set score to: 100%');
    }
    
    // Update message based on user's name
    if (state.user.displayName) {
      messageEl.textContent = `Excellent work, ${state.user.displayName}! You've successfully completed this lesson.`;
    } else {
      messageEl.textContent = 'Great job! You\'ve successfully completed this lesson.';
    }
    
    console.log('Removing hidden class from modal');
    modal.classList.remove('hidden');
    
    console.log('=== MODAL SETUP COMPLETE ===');
  }

  function hideLessonCompletionModal() {
    $('#lesson-completion-modal').classList.add('hidden');
  }

  function progressToNextLesson() {
    console.log('=== PROGRESSING TO NEXT LESSON ===');
    console.log('Current subject ID:', state.subjectId);
    
    const sub = state.catalog.find(s => s.id === state.subjectId);
    console.log('Current subject:', sub);
    
    if (sub && sub.courseId && sub.lessonNumber) {
      const courseSubjects = state.catalog.filter(s => s.courseId === sub.courseId);
      console.log('Course subjects:', courseSubjects.map(s => ({ id: s.id, lesson: s.lessonNumber, title: s.title })));
      
      const nextLesson = courseSubjects.find(s => s.lessonNumber === sub.lessonNumber + 1);
      console.log('Next lesson:', nextLesson);
      console.log('Lesson progress:', state.lessonProgress);
      
      const isNextUnlocked = nextLesson && state.lessonProgress && 
                            state.lessonProgress.unlockedLessons && 
                            state.lessonProgress.unlockedLessons.includes(nextLesson.lessonNumber);
      console.log('Is next lesson unlocked?', isNextUnlocked);
      
      if (nextLesson && isNextUnlocked) {
        const lessonTitle = nextLesson.title.split(' - ')[1] || 'Next Lesson';
        console.log('Advancing to:', lessonTitle);
        showToast(`🚀 Starting ${lessonTitle}...`);
        setTimeout(() => {
          console.log('Selecting next subject:', nextLesson.id);
          selectSubject(nextLesson.id);
        }, 1000);
      } else if (!nextLesson) {
        console.log('No more lessons - course completed');
        showToast('🏆 Course completed! Great job!');
      } else {
        console.log('Next lesson locked');
        showToast('❌ Next lesson is locked');
      }
    } else {
      console.log('Cannot progress - missing course info');
      showToast('❌ Cannot find next lesson');
    }
    
    console.log('=== PROGRESSION LOGIC COMPLETE ===');
  }

  // Welcome modal and personalization
  function showWelcomeModal() {
    $('#welcome-modal').classList.remove('hidden');
  }

  function hideWelcomeModal() {
    console.log('Hiding welcome modal...');
    const modal = $('#welcome-modal');
    console.log('Modal element:', modal);
    console.log('Modal classes before:', modal.className);
    modal.classList.add('hidden');
    console.log('Modal classes after:', modal.className);
  }

  function updateWelcomeTitle() {
    const title = $('#welcome-title');
    if (state.user.displayName) {
      title.textContent = `Welcome back, ${state.user.displayName}! Choose a Language`;
    } else {
      title.textContent = 'Choose a Language';
    }
  }

  function setupModalEventListeners() {
    console.log('Setting up modal event listeners...');
    
    // Gender button selection
    $$('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('Gender button clicked:', btn.dataset.gender);
        $$('.gender-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    // Skip setup
    const skipBtn = $('#skip-setup');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        console.log('Skip setup clicked');
        hideWelcomeModal();
        updateWelcomeTitle();
      });
    }

    // Save profile
    const saveBtn = $('#save-profile');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        console.log('Save profile clicked');
        const nameInput = $('#user-name');
        const selectedGender = $('.gender-btn.selected');
        
        const profileData = {
          displayName: nameInput.value.trim() || null,
          gender: selectedGender ? selectedGender.dataset.gender : null,
          isProfileComplete: true
        };

        console.log('Profile data:', profileData);

        try {
          const response = await api('/api/user', { 
            method: 'POST', 
            body: JSON.stringify(profileData) 
          });
          
          console.log('API response:', response);
          
          state.user = { ...state.user, ...profileData };
          hideWelcomeModal();
          updateWelcomeTitle();
          
          if (profileData.displayName) {
            showToast(`Welcome to LanguageApp, ${profileData.displayName}! 🎉`);
          } else {
            showToast('Profile saved! Let\'s start learning! 🚀');
          }
        } catch (e) {
          console.error('Failed to save profile:', e);
          showToast('Failed to save profile. Please try again.');
        }
      });
    } else {
      console.error('Save profile button not found!');
    }
  }

  function setupLessonCompletionEventListeners() {
    console.log('Setting up lesson completion modal event listeners...');
    
    // Remove any existing delegated listeners first
    document.removeEventListener('click', handleLessonModalClick);
    
    // Add single delegated event listener to handle both buttons
    document.addEventListener('click', handleLessonModalClick);
    
    console.log('Lesson completion event delegation set up');
  }
  
  function handleLessonModalClick(e) {
    console.log('Document click detected, target:', e.target.id, e.target.className);
    
    if (e.target.id === 'stay-lesson') {
      e.preventDefault();
      e.stopPropagation();
      console.log('Stay lesson button clicked via delegation');
      hideLessonCompletionModal();
      showToast('Continue practicing this lesson! 📚');
    } else if (e.target.id === 'next-lesson') {
      e.preventDefault();
      e.stopPropagation();
      console.log('Next lesson button clicked via delegation');
      hideLessonCompletionModal();
      progressToNextLesson();
    }
  }

  // Nav and events
  $('#logo').addEventListener('click', () => {
    state.currentLanguage = null;
    state.currentCourse = null;
    switchView('onboarding');
    renderLanguages();
    updateURL('/home');
  });

  // Mode switching
  $('#learn-mode').addEventListener('click', () => setMode('learn'));
  $('#practice-mode').addEventListener('click', () => setMode('practice'));
  $('#review-mode').addEventListener('click', () => setMode('review'));

  function setMode(mode) {
    state.currentMode = mode;
    $$('.mode-btn').forEach(btn => btn.classList.remove('active'));
    $(`#${mode}-mode`).classList.add('active');
    nextQuestion(); // Refresh with new mode
  }

  $('#back-to-languages').addEventListener('click', () => {
    switchView('onboarding');
    renderLanguages();
    updateURL('/home');
  });

  $('#back-to-subjects').addEventListener('click', () => {
    if (state.currentLanguage) {
      const languages = groupByLanguage(state.catalog);
      selectLanguage(state.currentLanguage, languages[state.currentLanguage]);
    } else {
      switchView('onboarding');
      renderLanguages();
      updateURL('/home');
    }
  });

  $$('.nav').forEach(n => n.addEventListener('click', async () => {
    const target = n.dataset.nav;
    if (target === 'stats') {
      await updateStatsProgress();
    }
    if (target) switchView(target);
  }));

  $('#reset').addEventListener('click', async () => {
    await api('/api/reset', { method: 'POST' });
    await loadUser();
    await updateStatsProgress();
    showToast('Progress reset');
    switchView('onboarding');
    
    // Show welcome modal again for fresh setup
    if (!state.user.isProfileComplete) {
      showWelcomeModal();
    } else {
      updateWelcomeTitle();
    }
  });

  // Initialize routing
  window.addEventListener('popstate', handleRoute);

  // Init
  (async function init() {
    try {
      await loadCatalog();
      await loadUser();
      await setEnvBadge();
      
      // Setup modal event listeners immediately
      setupModalEventListeners();
      setupLessonCompletionEventListeners();
      
      // Show welcome modal for new users
      if (!state.user.isProfileComplete) {
        showWelcomeModal();
      } else {
        updateWelcomeTitle();
      }
      
      // Handle initial route - always respect the URL
      const routeHandled = handleRoute();
      
      // Only auto-navigate to user's preferences if we're at root and no specific route
      // This has been disabled to always start at home page
      // Users can manually navigate to their preferred content
      
    } catch (e) {
      console.error(e);
    }
  })();
})();

// --- TTS helper ---
function speak(text, lang) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

// --- Graph render helper ---
function renderGraph(graph) {
  const g = graph || { nodes: [], edges: [] };
  const width = 320, height = 200;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.style.background = '#111528';
  svg.style.borderRadius = '8px';

  const nodeById = new Map();
  g.nodes.forEach(n => nodeById.set(n.id, n));

  // Draw edges
  g.edges.forEach(e => {
    const a = nodeById.get(e.from), b = nodeById.get(e.to);
    if (!a || !b) return;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('stroke', '#2a2f55');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);
  });

  // Draw nodes
  g.nodes.forEach(n => {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', n.x); circle.setAttribute('cy', n.y); circle.setAttribute('r', 14);
    circle.setAttribute('fill', '#1b1f3a');
    circle.setAttribute('stroke', '#7c5cff');
    svg.appendChild(circle);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', n.x); label.setAttribute('y', n.y + 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '12');
    label.setAttribute('fill', '#e8ebff');
    label.textContent = n.label || n.id;
    svg.appendChild(label);
  });

  return svg;
}
