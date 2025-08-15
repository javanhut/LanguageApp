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
    // Navigation active states are now handled by track selection
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
        } else if (title.includes('japanese') || s.langTo === 'ja') {
          language = 'Japanese';
        }
        
        if (!languages[language]) {
          languages[language] = [];
        }
        languages[language].push(s);
      }
    });
    return languages;
  }

  // Track state
  let currentTrack = 'spoken';
  
  function renderTrackContent(track = 'spoken') {
    currentTrack = track;
    const container = $('#language-grid');
    container.innerHTML = '';
    
    if (track === 'spoken') {
      // Render spoken languages
      const languages = groupByLanguage(state.catalog);
      setText('#welcome-title', 'Choose a Language');
      
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
          'Italian': '🇮🇹',
          'Japanese': '🇯🇵'
        };
        
        div.innerHTML = `
          <div class="flag">${flags[langName] || '🌍'}</div>
          <div class="lang-name">${langName}</div>
          <div class="lang-count">${subjects.length} courses, ${totalLessons} lessons</div>
        `;
        div.addEventListener('click', () => selectLanguage(langName, subjects));
        container.appendChild(div);
      }
    } else if (track === 'programming') {
      // Render programming languages (for now, show placeholder)
      setText('#welcome-title', 'Choose a Programming Language');
      
      const programmingLanguages = [
        { name: 'Python', icon: '🐍', description: 'Beginner-friendly, versatile' },
        { name: 'JavaScript', icon: '🌐', description: 'Web development essential' },
        { name: 'Java', icon: '☕', description: 'Enterprise & Android' },
        { name: 'C++', icon: '⚡', description: 'Systems programming' },
        { name: 'Go', icon: '🐹', description: 'Modern, concurrent' },
        { name: 'Rust', icon: '🦀', description: 'Memory-safe systems' }
      ];
      
      programmingLanguages.forEach(lang => {
        const div = document.createElement('div');
        div.className = 'language-card';
        div.innerHTML = `
          <div class="flag">${lang.icon}</div>
          <div class="lang-name">${lang.name}</div>
          <div class="lang-count">${lang.description}</div>
          <div style="margin-top: 10px; color: var(--muted); font-size: 12px;">Coming Soon!</div>
        `;
        div.style.opacity = '0.6';
        container.appendChild(div);
      });
    } else if (track === 'misc') {
      // Render Computer Science topics
      setText('#welcome-title', 'Choose a Computer Science Topic');
      
      const miscSubjects = state.catalog.filter(s => s.track === 'misc');
      const grouped = {};
      
      miscSubjects.forEach(s => {
        // Group by topic area
        let category = 'Other';
        const title = s.title.toLowerCase();
        
        if (title.includes('algorithm')) {
          category = 'Algorithms';
        } else if (title.includes('data structure')) {
          category = 'Data Structures';
        } else if (title.includes('graph') || title.includes('tree')) {
          category = 'Graphs & Trees';
        } else if (title.includes('dp') || title.includes('greedy')) {
          category = 'Dynamic Programming';
        }
        
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(s);
      });
      
      for (const [category, subjects] of Object.entries(grouped)) {
        const div = document.createElement('div');
        div.className = 'language-card';
        
        const totalLessons = subjects.reduce((sum, s) => sum + (s.count || 0), 0);
        
        // Icons for CS topics
        const icons = {
          'Algorithms': '🔄',
          'Data Structures': '📊',
          'Graphs & Trees': '🌳',
          'Dynamic Programming': '💎',
          'Other': '📚'
        };
        
        div.innerHTML = `
          <div class="flag">${icons[category] || '📚'}</div>
          <div class="lang-name">${category}</div>
          <div class="lang-count">${subjects.length} modules, ${totalLessons} problems</div>
        `;
        div.addEventListener('click', () => selectLanguage(category, subjects));
        container.appendChild(div);
      }
    } else if (track === 'math') {
      // Render Mathematics topics
      setText('#welcome-title', 'Choose a Mathematics Topic');
      
      const mathTopics = [
        { name: 'Algebra', icon: '➕', description: 'Equations, functions, polynomials' },
        { name: 'Calculus', icon: '∫', description: 'Derivatives, integrals, limits' },
        { name: 'Geometry', icon: '📐', description: 'Shapes, proofs, trigonometry' },
        { name: 'Statistics', icon: '📊', description: 'Probability, distributions, analysis' },
        { name: 'Linear Algebra', icon: '🔢', description: 'Vectors, matrices, transformations' },
        { name: 'Number Theory', icon: '🔣', description: 'Primes, modular arithmetic' }
      ];
      
      mathTopics.forEach(topic => {
        const div = document.createElement('div');
        div.className = 'language-card';
        div.innerHTML = `
          <div class="flag">${topic.icon}</div>
          <div class="lang-name">${topic.name}</div>
          <div class="lang-count">${topic.description}</div>
          <div style="margin-top: 10px; color: var(--muted); font-size: 12px;">Coming Soon!</div>
        `;
        div.style.opacity = '0.6';
        container.appendChild(div);
      });
    } else if (track === 'physics') {
      // Render Physics topics
      setText('#welcome-title', 'Choose a Physics Topic');
      
      const physicsTopics = [
        { name: 'Classical Mechanics', icon: '🎱', description: 'Motion, forces, energy' },
        { name: 'Electromagnetism', icon: '⚡', description: 'Electric & magnetic fields' },
        { name: 'Thermodynamics', icon: '🔥', description: 'Heat, temperature, entropy' },
        { name: 'Quantum Mechanics', icon: '⚛️', description: 'Wave functions, uncertainty' },
        { name: 'Optics', icon: '💡', description: 'Light, reflection, refraction' },
        { name: 'Relativity', icon: '🚀', description: 'Space-time, gravity' }
      ];
      
      physicsTopics.forEach(topic => {
        const div = document.createElement('div');
        div.className = 'language-card';
        div.innerHTML = `
          <div class="flag">${topic.icon}</div>
          <div class="lang-name">${topic.name}</div>
          <div class="lang-count">${topic.description}</div>
          <div style="margin-top: 10px; color: var(--muted); font-size: 12px;">Coming Soon!</div>
        `;
        div.style.opacity = '0.6';
        container.appendChild(div);
      });
    } else if (track === 'chemistry') {
      // Render Chemistry topics
      setText('#welcome-title', 'Choose a Chemistry Topic');
      
      const chemistryTopics = [
        { name: 'General Chemistry', icon: '⚗️', description: 'Atoms, molecules, reactions' },
        { name: 'Organic Chemistry', icon: '🧪', description: 'Carbon compounds, synthesis' },
        { name: 'Inorganic Chemistry', icon: '💎', description: 'Metals, minerals, complexes' },
        { name: 'Physical Chemistry', icon: '📈', description: 'Thermodynamics, kinetics' },
        { name: 'Biochemistry', icon: '🧬', description: 'Proteins, enzymes, metabolism' },
        { name: 'Analytical Chemistry', icon: '🔬', description: 'Separation, identification' }
      ];
      
      chemistryTopics.forEach(topic => {
        const div = document.createElement('div');
        div.className = 'language-card';
        div.innerHTML = `
          <div class="flag">${topic.icon}</div>
          <div class="lang-name">${topic.name}</div>
          <div class="lang-count">${topic.description}</div>
          <div style="margin-top: 10px; color: var(--muted); font-size: 12px;">Coming Soon!</div>
        `;
        div.style.opacity = '0.6';
        container.appendChild(div);
      });
    } else if (track === 'biology') {
      // Render Biology topics
      setText('#welcome-title', 'Choose a Biology Topic');
      
      const biologyTopics = [
        { name: 'Cell Biology', icon: '🦠', description: 'Cells, organelles, membranes' },
        { name: 'Genetics', icon: '🧬', description: 'DNA, heredity, mutations' },
        { name: 'Ecology', icon: '🌿', description: 'Ecosystems, populations' },
        { name: 'Anatomy', icon: '🫀', description: 'Body systems, organs' },
        { name: 'Evolution', icon: '🦕', description: 'Natural selection, speciation' },
        { name: 'Microbiology', icon: '🔬', description: 'Bacteria, viruses, fungi' }
      ];
      
      biologyTopics.forEach(topic => {
        const div = document.createElement('div');
        div.className = 'language-card';
        div.innerHTML = `
          <div class="flag">${topic.icon}</div>
          <div class="lang-name">${topic.name}</div>
          <div class="lang-count">${topic.description}</div>
          <div style="margin-top: 10px; color: var(--muted); font-size: 12px;">Coming Soon!</div>
        `;
        div.style.opacity = '0.6';
        container.appendChild(div);
      });
    }
  }
  
  // Renamed for clarity but keep backward compatibility
  function renderLanguages() {
    renderTrackContent(currentTrack);
  }

  async function selectLanguage(langName, subjects) {
    state.currentLanguage = langName;
    state.currentCourse = subjects.find(s => s.courseId)?.courseId || null;
    $('#language-title').textContent = `${langName} Lessons`;
    
    // Check if this is a conceptual CS course
    const hasConceptualCS = subjects.some(s => s.courseType === 'conceptual');
    
    if (hasConceptualCS) {
      await renderConceptualCSCourse(langName, subjects);
    } else if (hasStructuredCurriculum(langName)) {
      await renderStructuredCurriculum(langName, subjects);
    } else {
      renderLessons(subjects);
    }
    
    switchView('language-lessons');
    updateURL(`/${langName.toLowerCase()}`);
  }
  
  let curriculumState = {
    currentLevel: null,
    curriculum: null,
    sidePanelOpen: false,
    currentLanguage: null
  };

  function hasStructuredCurriculum(langName) {
    // Languages that have structured multi-level courses
    const structuredLanguages = ['Portuguese', 'Spanish', 'German', 'Japanese', 'French', 'Italian'];
    return structuredLanguages.includes(langName);
  }

  function getLanguageConfig(langName) {
    const configs = {
      'Portuguese': {
        emoji: '🇧🇷',
        fullName: 'Brazilian Portuguese',
        apiEndpoint: '/api/portuguese-curriculum'
      },
      'Spanish': {
        emoji: '🇪🇸', 
        fullName: 'Spanish',
        apiEndpoint: '/api/spanish-curriculum'
      },
      'German': {
        emoji: '🇩🇪',
        fullName: 'German', 
        apiEndpoint: '/api/german-curriculum'
      },
      'Japanese': {
        emoji: '🇯🇵',
        fullName: 'Japanese',
        apiEndpoint: '/api/japanese-curriculum'
      },
      'French': {
        emoji: '🇫🇷',
        fullName: 'French',
        apiEndpoint: '/api/french-curriculum'
      },
      'Italian': {
        emoji: '🇮🇹',
        fullName: 'Italian',
        apiEndpoint: '/api/italian-curriculum'
      }
    };
    return configs[langName];
  }

  async function renderStructuredCurriculum(langName, subjects) {
    curriculumState.currentLanguage = langName;
    const config = getLanguageConfig(langName);
    
    // For Portuguese, use the API endpoint. For others, build curriculum from subjects
    if (langName === 'Portuguese') {
      await renderPortugueseCurriculum();
    } else {
      await renderGenericCurriculum(langName, subjects, config);
    }
  }

  async function renderGenericCurriculum(langName, subjects, config) {
    try {
      const container = $('#lessons');
      container.innerHTML = '';
      
      // Create the main curriculum container
      const curriculumContainer = document.createElement('div');
      curriculumContainer.className = 'curriculum-container';
      
      // Create close button for the curriculum
      const closeButton = document.createElement('button');
      closeButton.className = 'curriculum-close-btn';
      closeButton.innerHTML = '× Close';
      closeButton.addEventListener('click', () => {
        closeCurriculum();
      });
      
      // Create side panel trigger
      const sideTrigger = document.createElement('div');
      sideTrigger.className = 'curriculum-side-trigger';
      sideTrigger.textContent = 'Levels';
      sideTrigger.addEventListener('click', () => {
        toggleSidePanel();
      });
      
      // Create side panel
      const sidePanel = document.createElement('div');
      sidePanel.className = 'curriculum-side-panel';
      sidePanel.id = 'curriculum-side-panel';
      
      // Side panel header
      const sidePanelHeader = document.createElement('div');
      sidePanelHeader.className = 'side-panel-header';
      sidePanelHeader.innerHTML = `
        <h3>${config.emoji} ${config.fullName}</h3>
        <p>Choose your level to focus and start learning</p>
      `;
      sidePanel.appendChild(sidePanelHeader);
      
      // Group subjects by course
      const courseGroups = groupSubjectsByCourse(subjects);
      
      // Create level list
      const levelList = document.createElement('div');
      levelList.className = 'curriculum-level-list';
      
      courseGroups.forEach((course, index) => {
        const levelItem = document.createElement('div');
        levelItem.className = 'curriculum-level-item';
        levelItem.dataset.courseId = course.courseId;
        
        const levelNumber = index + 1;
        const progressText = `${course.subjects.length} lessons`;
        
        levelItem.innerHTML = `
          <div class="level-icon">${levelNumber}</div>
          <div class="level-info">
            <div class="level-title">${course.title}</div>
            <div class="level-progress">${progressText}</div>
          </div>
        `;
        
        levelItem.addEventListener('click', () => {
          selectGenericLevel(course);
          closeSidePanel();
        });
        
        levelList.appendChild(levelItem);
      });
      
      sidePanel.appendChild(levelList);
      
      // Create main content area
      const mainContent = document.createElement('div');
      mainContent.className = 'curriculum-main-content';
      mainContent.id = 'curriculum-main-content';
      
      // Show welcome screen initially
      showGenericWelcomeScreen(mainContent, config);
      
      // Assemble everything
      curriculumContainer.appendChild(closeButton);
      curriculumContainer.appendChild(sidePanel);
      curriculumContainer.appendChild(mainContent);
      curriculumContainer.appendChild(sideTrigger);
      
      // Append to body
      document.body.appendChild(curriculumContainer);
      
    } catch (error) {
      console.error(`Failed to load ${langName} curriculum:`, error);
      renderLessons(subjects);
    }
  }

  async function renderPortugueseCurriculum() {
    try {
      // Clean up any existing curriculum containers first
      closeCurriculum();
      
      const curriculum = await api('/api/portuguese-curriculum');
      curriculumState.curriculum = curriculum;
      
      const container = $('#lessons');
      container.innerHTML = '';
      
      // Create the main curriculum container
      const curriculumContainer = document.createElement('div');
      curriculumContainer.className = 'curriculum-container';
      
      // Create close button for the curriculum
      const closeButton = document.createElement('button');
      closeButton.className = 'curriculum-close-btn';
      closeButton.innerHTML = '× Close';
      closeButton.addEventListener('click', () => {
        closeCurriculum();
      });
      
      // Create side panel trigger
      const sideTrigger = document.createElement('div');
      sideTrigger.className = 'curriculum-side-trigger';
      sideTrigger.textContent = 'Levels';
      sideTrigger.addEventListener('click', () => {
        toggleSidePanel();
      });
      
      // Create side panel
      const sidePanel = document.createElement('div');
      sidePanel.className = 'curriculum-side-panel';
      sidePanel.id = 'curriculum-side-panel';
      
      // Side panel header
      const sidePanelHeader = document.createElement('div');
      sidePanelHeader.className = 'side-panel-header';
      sidePanelHeader.innerHTML = `
        <h3>🇧🇷 Portuguese Course</h3>
        <p>Choose your level to focus and start learning</p>
      `;
      sidePanel.appendChild(sidePanelHeader);
      
      // Create level list
      const levelList = document.createElement('div');
      levelList.className = 'curriculum-level-list';
      
      // Flatten all courses from all categories
      const allCourses = [];
      curriculum.categories.forEach(category => {
        category.courses.forEach(course => {
          allCourses.push({
            ...course,
            category: category.title
          });
        });
      });
      
      allCourses.forEach((course, index) => {
        const levelItem = document.createElement('div');
        levelItem.className = `curriculum-level-item ${!course.isUnlocked ? 'locked' : ''}`;
        levelItem.dataset.courseId = course.id;
        
        const levelNumber = index + 1;
        const progressText = course.progress.totalLessons > 0 
          ? `${course.progress.completedLessons}/${course.progress.totalLessons} lessons`
          : 'Ready to start';
        
        levelItem.innerHTML = `
          <div class="level-icon">${levelNumber}</div>
          <div class="level-info">
            <div class="level-title">${course.title}</div>
            <div class="level-progress">${progressText}</div>
          </div>
        `;
        
        if (course.isUnlocked) {
          levelItem.addEventListener('click', () => {
            selectLevel(course);
            // Always close side panel when level is selected
            closeSidePanel();
          });
        }
        
        levelList.appendChild(levelItem);
      });
      
      sidePanel.appendChild(levelList);
      
      // Create main content area
      const mainContent = document.createElement('div');
      mainContent.className = 'curriculum-main-content';
      mainContent.id = 'curriculum-main-content';
      
      // Show welcome screen initially
      showWelcomeScreen(mainContent);
      
      // Assemble everything
      curriculumContainer.appendChild(closeButton);
      curriculumContainer.appendChild(sidePanel);
      curriculumContainer.appendChild(mainContent);
      curriculumContainer.appendChild(sideTrigger);
      
      // Append to body instead of container to avoid layout issues
      document.body.appendChild(curriculumContainer);
      
    } catch (error) {
      console.error('Failed to load Portuguese curriculum:', error);
      // Fallback to regular lesson rendering
      const portugueseSubjects = state.catalog.filter(s => 
        s.title.toLowerCase().includes('portuguese') || s.langTo === 'pt'
      );
      renderLessons(portugueseSubjects);
    }
  }
  
  function showWelcomeScreen(container) {
    container.innerHTML = `
      <div class="curriculum-welcome">
        <h2>🇧🇷 Welcome to Portuguese</h2>
        <p>Master Brazilian Portuguese with our structured learning path. From absolute beginner to advanced fluency, each level builds upon the previous one.</p>
        <p class="welcome-instruction">👈 Open the side panel to choose your level and start learning!</p>
      </div>
    `;
  }
  
  function selectLevel(course) {
    curriculumState.currentLevel = course;
    
    // Update active state in side panel
    document.querySelectorAll('.curriculum-level-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.courseId === course.id) {
        item.classList.add('active');
      }
    });
    
    // Show level content in main area
    showLevelContent(course);
  }
  
  function showLevelContent(course) {
    const mainContent = $('#curriculum-main-content');
    
    mainContent.innerHTML = `
      <div class="curriculum-level-display">
        <div class="level-display-header">
          <h2>${course.title}</h2>
          <p>${course.description}</p>
        </div>
        <div class="level-lessons-grid" id="level-lessons-grid">
          <!-- Lessons will be loaded here -->
        </div>
      </div>
    `;
    
    // Load and display lessons for this course
    loadCourseFromCurriculum(course.id);
  }
  
  function toggleSidePanel() {
    const sidePanel = $('#curriculum-side-panel');
    curriculumState.sidePanelOpen = !curriculumState.sidePanelOpen;
    
    if (curriculumState.sidePanelOpen) {
      sidePanel.classList.add('open');
    } else {
      sidePanel.classList.remove('open');
    }
  }
  
  function closeSidePanel() {
    const sidePanel = $('#curriculum-side-panel');
    curriculumState.sidePanelOpen = false;
    sidePanel.classList.remove('open');
  }
  
  function groupSubjectsByCourse(subjects) {
    // Group subjects by courseId, or create individual groups for non-course subjects
    const courses = new Map();
    
    subjects.forEach(subject => {
      if (subject.courseId) {
        if (!courses.has(subject.courseId)) {
          courses.set(subject.courseId, {
            courseId: subject.courseId,
            title: extractCourseTitle(subject.title),
            subjects: []
          });
        }
        courses.get(subject.courseId).subjects.push(subject);
      } else {
        // Individual subject becomes its own "course"
        courses.set(subject.id, {
          courseId: subject.id,
          title: subject.title,
          subjects: [subject]
        });
      }
    });
    
    return Array.from(courses.values());
  }
  
  function extractCourseTitle(lessonTitle) {
    // Extract course name from lesson title
    // e.g. "🇪🇸 Spanish Complete Course - Lesson 1: Greetings" → "Spanish Complete Course"
    const match = lessonTitle.match(/^[🇪🇸🇩🇪🇯🇵🇧🇷]*\s*([^-]+)/);
    return match ? match[1].trim() : lessonTitle;
  }
  
  function showGenericWelcomeScreen(container, config) {
    container.innerHTML = `
      <div class="curriculum-welcome">
        <h2>${config.emoji} Welcome to ${config.fullName}</h2>
        <p>Master ${config.fullName} with our structured learning path. Progress through each level to build your fluency step by step.</p>
        <p class="welcome-instruction">👈 Open the side panel to choose your level and start learning!</p>
      </div>
    `;
  }
  
  function selectGenericLevel(course) {
    curriculumState.currentLevel = course;
    
    // Update active state in side panel
    document.querySelectorAll('.curriculum-level-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.courseId === course.courseId) {
        item.classList.add('active');
      }
    });
    
    // Show level content in main area
    showGenericLevelContent(course);
  }
  
  function showGenericLevelContent(course) {
    const mainContent = $('#curriculum-main-content');
    
    mainContent.innerHTML = `
      <div class="curriculum-level-display">
        <div class="level-display-header">
          <h2>${course.title}</h2>
          <p>Complete all lessons in this level to master the fundamentals</p>
        </div>
        <div class="level-lessons-grid" id="level-lessons-grid">
          <!-- Lessons will be loaded here -->
        </div>
      </div>
    `;
    
    // Load and display lessons for this course
    const levelLessonsGrid = $('#level-lessons-grid');
    if (levelLessonsGrid) {
      renderLessonsInGrid(course.subjects, levelLessonsGrid);
    }
  }

  function closeCurriculum() {
    const curriculumContainer = document.querySelector('.curriculum-container');
    if (curriculumContainer) {
      curriculumContainer.remove();
    }
    
    // Reset state
    curriculumState.currentLevel = null;
    curriculumState.curriculum = null;
    curriculumState.sidePanelOpen = false;
    curriculumState.currentLanguage = null;
    
    // Return to the language lessons view
    switchView('language-lessons');
  }
  
  function getCourseTitleById(courseId) {
    const titleMap = {
      'portuguese_foundations': 'Level 1: Foundations',
      'portuguese_grammar_basics': 'Level 2: Grammar Basics',
      'portuguese_conversation_starter': 'Level 3: First Conversations',
      'portuguese_grammar_intermediate': 'Level 4: Advanced Grammar',
      'portuguese_verbs_mastery': 'Level 5: Verb Mastery',
      'portuguese_conversation_intermediate': 'Level 6: Fluent Conversations'
    };
    return titleMap[courseId] || courseId;
  }
  
  async function loadCourseFromCurriculum(courseId) {
    // Find subjects that belong to this course
    const courseSubjects = state.catalog.filter(s => s.courseId === courseId);
    if (courseSubjects.length > 0) {
      state.currentCourse = courseId;
      
      // Check if we're in the curriculum view
      const levelLessonsGrid = $('#level-lessons-grid');
      if (levelLessonsGrid) {
        // Render lessons in the level display grid
        renderLessonsInGrid(courseSubjects, levelLessonsGrid);
      } else {
        // Fallback to regular lesson rendering
        renderLessons(courseSubjects);
      }
    }
  }
  
  function renderLessonsInGrid(subjects, container) {
    container.innerHTML = '';
    
    subjects.forEach(subject => {
      const lessonCard = document.createElement('div');
      lessonCard.className = 'subject';
      
      lessonCard.innerHTML = `
        <div class="track">${subject.track}</div>
        <div class="title">${subject.title}</div>
        <div class="desc">${subject.description}</div>
      `;
      
      lessonCard.addEventListener('click', () => {
        // Close the side panel first
        closeSidePanel();
        // Then close the curriculum overlay and open the lesson
        closeCurriculum();
        selectSubject(subject.id);
      });
      
      container.appendChild(lessonCard);
    });
  }

  async function renderConceptualCSCourse(courseName, subjects) {
    // Find the conceptual course
    const conceptualCourse = subjects.find(s => s.courseType === 'conceptual');
    if (!conceptualCourse) {
      console.error('No conceptual CS course found');
      renderLessons(subjects);
      return;
    }

    try {
      // Load the full course data
      const courseData = await api(`/api/content/${conceptualCourse.id}`);
      
      const container = $('#lessons');
      container.innerHTML = '';
      
      // Check if this is the new algorithms complete format with items array
      if (courseData.items && Array.isArray(courseData.items)) {
        renderAlgorithmsCompleteCourse(courseData);
        return;
      }
      
      // Create the main CS course container
      const csContainer = document.createElement('div');
      csContainer.className = 'cs-course-container';
      
      // Course header with significance and real-world applications
      const courseHeader = document.createElement('div');
      courseHeader.className = 'cs-course-header';
      courseHeader.innerHTML = `
        <div class="cs-course-title">
          <h1>${courseData.title}</h1>
          <p class="cs-course-description">${courseData.description}</p>
        </div>
        <div class="cs-course-significance">
          <h3>Why This Matters</h3>
          <p>${courseData.significance || courseData.chapters?.[0]?.significance || 'Fundamental computer science concepts that power modern technology.'}</p>
        </div>
        <div class="cs-real-world-apps">
          <h3>Real-World Applications</h3>
          <ul>
            ${(courseData.realWorldApplications || courseData.chapters?.[0]?.realWorldApplications || [
              'Software development and system design',
              'Data analysis and machine learning', 
              'Web and mobile application development'
            ]).map(app => `<li>${app}</li>`).join('')}
          </ul>
        </div>
      `;
      
      // Chapter navigation
      const chapterNav = document.createElement('div');
      chapterNav.className = 'cs-chapter-nav';
      chapterNav.innerHTML = `
        <h3>Course Chapters</h3>
        <div class="cs-chapters-grid" id="cs-chapters-grid"></div>
      `;
      
      // Render chapters
      const chaptersGrid = chapterNav.querySelector('#cs-chapters-grid');
      (courseData.chapters || []).forEach((chapter, index) => {
        const chapterCard = document.createElement('div');
        chapterCard.className = 'cs-chapter-card';
        chapterCard.innerHTML = `
          <div class="cs-chapter-number">${index + 1}</div>
          <div class="cs-chapter-info">
            <h4>${chapter.title}</h4>
            <p>${chapter.description}</p>
            <div class="cs-chapter-lessons">${chapter.lessons?.length || 0} lessons</div>
          </div>
          <div class="cs-chapter-arrow">→</div>
        `;
        
        chapterCard.addEventListener('click', () => {
          renderCSChapter(chapter, courseData);
        });
        
        chaptersGrid.appendChild(chapterCard);
      });
      
      csContainer.appendChild(courseHeader);
      csContainer.appendChild(chapterNav);
      
      container.appendChild(csContainer);
      
    } catch (error) {
      console.error('Failed to load conceptual CS course:', error);
      renderLessons(subjects);
    }
  }

  function renderAlgorithmsCompleteCourse(courseData) {
    const container = $('#lessons');
    container.innerHTML = '';
    
    // Create main course container
    const courseContainer = document.createElement('div');
    courseContainer.className = 'algorithms-course-container';
    
    // Course header
    const header = document.createElement('div');
    header.className = 'algorithms-header';
    header.innerHTML = `
      <h1>${courseData.title}</h1>
      <p class="algorithms-description">${courseData.description}</p>
    `;
    
    // Create topics list
    const topicsList = document.createElement('div');
    topicsList.className = 'algorithms-topics-list';
    topicsList.innerHTML = '<h2>Topics</h2>';
    
    courseData.items.forEach((item, index) => {
      const topicCard = document.createElement('div');
      topicCard.className = 'algorithm-topic-card';
      topicCard.innerHTML = `
        <div class="topic-number">${index + 1}</div>
        <div class="topic-info">
          <h3>${item.prompt}</h3>
          <div class="topic-type">${item.type.replace(/_/g, ' ')}</div>
          ${item.explanation ? `<p class="topic-preview">${item.explanation.substring(0, 150)}...</p>` : ''}
        </div>
        <div class="topic-arrow">→</div>
      `;
      
      topicCard.addEventListener('click', () => {
        renderAlgorithmTopic(item, courseData);
      });
      
      topicsList.appendChild(topicCard);
    });
    
    courseContainer.appendChild(header);
    courseContainer.appendChild(topicsList);
    container.appendChild(courseContainer);
  }

  function renderAlgorithmTopic(item, courseData) {
    const container = $('#lessons');
    container.innerHTML = '';
    
    // Create topic container
    const topicContainer = document.createElement('div');
    topicContainer.className = 'algorithm-topic-container';
    
    // Topic header with back button
    const header = document.createElement('div');
    header.className = 'algorithm-topic-header';
    header.innerHTML = `
      <button class="back-btn" id="back-to-course">← Back to Course</button>
      <h2>${item.prompt}</h2>
      <div class="topic-type-badge">${item.type.replace(/_/g, ' ')}</div>
    `;
    
    header.querySelector('#back-to-course').addEventListener('click', () => {
      renderAlgorithmsCompleteCourse(courseData);
    });
    
    // Topic content
    const content = document.createElement('div');
    content.className = 'algorithm-topic-content';
    
    // Main explanation
    if (item.explanation) {
      const explanation = document.createElement('div');
      explanation.className = 'algorithm-explanation';
      explanation.innerHTML = `
        <h3>Understanding the Concept</h3>
        <div class="explanation-text">${item.explanation.replace(/\n/g, '<br>')}</div>
      `;
      content.appendChild(explanation);
    }
    
    // Interactive demo
    if (item.interactive_demo) {
      const demo = renderInteractiveDemo(item.interactive_demo);
      content.appendChild(demo);
    }
    
    // Performance demo
    if (item.performance_demo) {
      const perfDemo = renderPerformanceDemo(item.performance_demo);
      content.appendChild(perfDemo);
    }
    
    // Build together section
    if (item.build_together) {
      const buildSection = renderBuildTogether(item.build_together);
      content.appendChild(buildSection);
    }
    
    // Analysis section
    if (item.analysis) {
      const analysis = renderAnalysis(item.analysis);
      content.appendChild(analysis);
    }
    
    // Real-world connection
    if (item.real_world_connection) {
      const connection = document.createElement('div');
      connection.className = 'real-world-connection';
      connection.innerHTML = `
        <h3>🌍 Real-World Connection</h3>
        <p>${item.real_world_connection}</p>
      `;
      content.appendChild(connection);
    }
    
    // Key insight
    if (item.key_insight) {
      const insight = document.createElement('div');
      insight.className = 'key-insight';
      insight.innerHTML = `
        <h3>💡 Key Insight</h3>
        <p>${item.key_insight}</p>
      `;
      content.appendChild(insight);
    }
    
    // Performance comparison
    if (item.performance_comparison) {
      const comparison = renderPerformanceComparison(item.performance_comparison);
      content.appendChild(comparison);
    }
    
    // Progress check/quiz
    if (item.progress_check) {
      const progressCheck = renderProgressCheck(item.progress_check, item.id);
      content.appendChild(progressCheck);
    }
    
    topicContainer.appendChild(header);
    topicContainer.appendChild(content);
    container.appendChild(topicContainer);
  }

  function renderCSChapter(chapter, courseData) {
    const container = $('#lessons');
    container.innerHTML = '';
    
    // Create chapter view
    const chapterContainer = document.createElement('div');
    chapterContainer.className = 'cs-chapter-container';
    
    // Chapter header
    const chapterHeader = document.createElement('div');
    chapterHeader.className = 'cs-chapter-header';
    chapterHeader.innerHTML = `
      <button class="cs-back-btn" id="cs-back-to-course">← Back to Course</button>
      <div class="cs-chapter-title">
        <h2>${chapter.title}</h2>
        <p>${chapter.description}</p>
      </div>
      <div class="cs-chapter-significance">
        <h3>Why This Chapter Matters</h3>
        <p>${chapter.significance}</p>
      </div>
    `;
    
    // Add back button functionality
    chapterHeader.querySelector('#cs-back-to-course').addEventListener('click', () => {
      renderConceptualCSCourse(state.currentLanguage, [courseData]);
    });
    
    // Lessons list
    const lessonsContainer = document.createElement('div');
    lessonsContainer.className = 'cs-lessons-container';
    lessonsContainer.innerHTML = `
      <h3>Lessons</h3>
      <div class="cs-lessons-list" id="cs-lessons-list"></div>
    `;
    
    const lessonsList = lessonsContainer.querySelector('#cs-lessons-list');
    (chapter.lessons || []).forEach((lesson, index) => {
      const lessonCard = document.createElement('div');
      lessonCard.className = 'cs-lesson-card';
      lessonCard.innerHTML = `
        <div class="cs-lesson-number">${index + 1}</div>
        <div class="cs-lesson-info">
          <h4>${lesson.title}</h4>
          <div class="cs-lesson-type">${lesson.type.replace(/_/g, ' ')}</div>
          ${lesson.explanation ? `<p class="cs-lesson-preview">${lesson.explanation.substring(0, 150)}...</p>` : ''}
        </div>
        <div class="cs-lesson-arrow">Start →</div>
      `;
      
      lessonCard.addEventListener('click', () => {
        renderCSLesson(lesson, chapter, courseData);
      });
      
      lessonsList.appendChild(lessonCard);
    });
    
    chapterContainer.appendChild(chapterHeader);
    chapterContainer.appendChild(lessonsContainer);
    container.appendChild(chapterContainer);
  }

  function renderCSLesson(lesson, chapter, courseData) {
    const container = $('#lessons');
    container.innerHTML = '';
    
    // Create lesson view
    const lessonContainer = document.createElement('div');
    lessonContainer.className = 'cs-lesson-container';
    
    // Lesson header
    const lessonHeader = document.createElement('div');
    lessonHeader.className = 'cs-lesson-header';
    lessonHeader.innerHTML = `
      <button class="cs-back-btn" id="cs-back-to-chapter">← Back to ${chapter.title}</button>
      <div class="cs-lesson-title">
        <h2>${lesson.title}</h2>
        <div class="cs-lesson-type-badge">${lesson.type.replace(/_/g, ' ')}</div>
      </div>
    `;
    
    // Add back button functionality
    lessonHeader.querySelector('#cs-back-to-chapter').addEventListener('click', () => {
      renderCSChapter(chapter, courseData);
    });
    
    // Lesson content
    const lessonContent = document.createElement('div');
    lessonContent.className = 'cs-lesson-content';
    
    if (lesson.explanation) {
      const explanation = document.createElement('div');
      explanation.className = 'cs-lesson-explanation';
      explanation.innerHTML = `
        <h3>Understanding the Concept</h3>
        <div class="cs-explanation-text">${lesson.explanation}</div>
      `;
      lessonContent.appendChild(explanation);
    }
    
    // Interactive examples
    if (lesson.interactive_examples) {
      lesson.interactive_examples.forEach((example, index) => {
        const exampleDiv = document.createElement('div');
        exampleDiv.className = 'cs-interactive-example';
        exampleDiv.innerHTML = `
          <h4>Interactive Example ${index + 1}</h4>
          <div class="cs-example-content">
            ${renderInteractiveExample(example)}
          </div>
        `;
        lessonContent.appendChild(exampleDiv);
      });
    }
    
    // Concepts section
    if (lesson.concepts) {
      const conceptsDiv = document.createElement('div');
      conceptsDiv.className = 'cs-concepts-section';
      conceptsDiv.innerHTML = `
        <h3>Key Concepts</h3>
        <div class="cs-concepts-list">
          ${lesson.concepts.map(concept => `
            <div class="cs-concept-item">
              <h4>${concept.name}</h4>
              <p>${concept.explanation}</p>
              ${concept.analogy ? `<div class="cs-concept-analogy">💡 Think of it like: ${concept.analogy}</div>` : ''}
              ${concept.example ? `<div class="cs-concept-example">Example: ${concept.example}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
      lessonContent.appendChild(conceptsDiv);
    }
    
    // Progress check
    if (lesson.progress_check) {
      const progressCheck = document.createElement('div');
      progressCheck.className = 'cs-progress-check';
      progressCheck.innerHTML = `
        <h3>Check Your Understanding</h3>
        ${renderProgressCheck(lesson.progress_check)}
      `;
      lessonContent.appendChild(progressCheck);
    }
    
    lessonContainer.appendChild(lessonHeader);
    lessonContainer.appendChild(lessonContent);
    container.appendChild(lessonContainer);
  }

  function renderInteractiveExample(example) {
    if (example.type === 'step_builder') {
      return `
        <div class="cs-step-builder">
          <p>${example.prompt}</p>
          <div class="cs-steps-to-sort" id="steps-${Date.now()}">
            ${example.steps.map((step, index) => `
              <div class="cs-step-item" data-step="${index}">
                ${step}
              </div>
            `).join('')}
          </div>
          <button class="cs-check-order-btn">Check My Order</button>
          <div class="cs-example-explanation">${example.explanation}</div>
        </div>
      `;
    } else if (example.type === 'algorithm_comparison') {
      return `
        <div class="cs-algorithm-comparison">
          <h4>Scenario: ${example.scenario}</h4>
          <div class="cs-algorithms-grid">
            ${example.algorithms.map(algorithm => `
              <div class="cs-algorithm-card">
                <h5>${algorithm.name}</h5>
                <p><strong>Method:</strong> ${algorithm.steps}</p>
                <div class="cs-algorithm-pros">
                  <strong>Pros:</strong>
                  <ul>${algorithm.pros.map(pro => `<li>${pro}</li>`).join('')}</ul>
                </div>
                <div class="cs-algorithm-cons">
                  <strong>Cons:</strong>
                  <ul>${algorithm.cons.map(con => `<li>${con}</li>`).join('')}</ul>
                </div>
                <div class="cs-algorithm-efficiency">Efficiency: ${algorithm.efficiency}</div>
              </div>
            `).join('')}
          </div>
          <p><strong>Think about it:</strong> ${example.question}</p>
        </div>
      `;
    }
    return '<div class="cs-placeholder">Interactive example coming soon!</div>';
  }

  function renderProgressCheck(check) {
    if (check.type === 'understanding_check') {
      return `
        <div class="cs-understanding-check">
          <p><strong>${check.question}</strong></p>
          <div class="cs-check-options">
            ${check.options.map((option, index) => `
              <label class="cs-check-option">
                <input type="radio" name="understanding_check" value="${option}">
                <span>${option}</span>
              </label>
            `).join('')}
          </div>
          <button class="cs-check-answer-btn">Check Answer</button>
          <div class="cs-check-explanation" style="display: none;">
            <p><strong>Correct!</strong> ${check.explanation}</p>
          </div>
        </div>
      `;
    }
    return '<div class="cs-placeholder">Progress check coming soon!</div>';
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
    
    // Display grammar info if available
    const grammarInfo = $('#grammar-info');
    if (sub && sub.grammar) {
      grammarInfo.innerHTML = '<h4>Grammar Notes</h4>' + sub.grammar;
      grammarInfo.classList.remove('hidden');
    } else {
      grammarInfo.classList.add('hidden');
    }
    
    // Load and display vocabulary progress
    await loadVocabularyProgress(subjectId);
    
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
    const explanation = $('#explanation');
    
    hints.textContent = (item.hints && item.hints.join(' · ')) || '';
    area.innerHTML = '';
    helperButtons.innerHTML = '';
    
    // Hide explanation initially (will show after answer)
    explanation.classList.add('hidden');
    explanation.textContent = '';

    // Setup helper buttons in the dedicated container
    setupHelperButtons(item, helperButtons, hints);
    
    // Setup script helpers for multi-script languages
    setupScriptHelpers(item, helperButtons);
    
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
    } else if (langTo === 'it' || subjectLower.includes('italian')) {
      return [
        { char: 'à', label: 'à' }, { char: 'è', label: 'è' }, { char: 'é', label: 'é' },
        { char: 'ì', label: 'ì' }, { char: 'ò', label: 'ò' }, { char: 'ù', label: 'ù' }
      ];
    } else if (langTo === 'de' || subjectLower.includes('german')) {
      return [
        { char: 'ä', label: 'ä' }, { char: 'ö', label: 'ö' }, { char: 'ü', label: 'ü' },
        { char: 'ß', label: 'ß' }, { char: 'Ä', label: 'Ä' }, { char: 'Ö', label: 'Ö' },
        { char: 'Ü', label: 'Ü' }
      ];
    } else if (langTo === 'ja' || subjectLower.includes('japanese')) {
      return [
        { char: 'あ', label: 'あ' }, { char: 'い', label: 'い' }, { char: 'う', label: 'う' },
        { char: 'え', label: 'え' }, { char: 'お', label: 'お' }, { char: 'か', label: 'か' },
        { char: 'き', label: 'き' }, { char: 'く', label: 'く' }, { char: 'け', label: 'け' },
        { char: 'こ', label: 'こ' }, { char: 'ん', label: 'ん' }, { char: 'に', label: 'に' },
        { char: 'ち', label: 'ち' }, { char: 'は', label: 'は' }, { char: 'ば', label: 'ば' },
        { char: 'さ', label: 'さ' }, { char: 'し', label: 'し' }, { char: 'す', label: 'す' },
        { char: 'せ', label: 'せ' }, { char: 'そ', label: 'そ' }, { char: 'た', label: 'た' },
        { char: 'て', label: 'て' }, { char: 'と', label: 'と' }, { char: 'り', label: 'り' },
        { char: 'が', label: 'が' }
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
      'it': 'à è ì ▼',
      'ja': 'あ い う ▼'
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
      
      // Handle correct vs incorrect answers differently
      const hints = $('#hints');
      const explanation = $('#explanation');
      
      if (res.correct) {
        hints.textContent = 'Correct! ✅';
        hints.className = 'hints correct';
        
        // Show explanation if available
        if (state.currentItem && state.currentItem.explanation) {
          explanation.textContent = state.currentItem.explanation;
          explanation.classList.remove('hidden');
        }
        
        setTimeout(() => nextQuestion(), 800);
      } else {
        // Show learning mode for incorrect answers
        showLearningMode(res.answer, state.currentItem);
      }
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
  
  async function loadVocabularyProgress(subjectId) {
    try {
      const { mastery, vocabulary, readyForNextLesson } = await api(`/api/vocabulary-progress?subjectId=${encodeURIComponent(subjectId)}`);
      displayVocabularyProgress(mastery, readyForNextLesson);
    } catch (e) {
      // Hide vocabulary progress if no data or error
      $('#vocabulary-progress').classList.add('hidden');
    }
  }
  
  function displayVocabularyProgress(mastery, readyForNext) {
    const progressDiv = $('#vocabulary-progress');
    
    if (mastery.total === 0) {
      progressDiv.classList.add('hidden');
      return;
    }
    
    const percentage = mastery.percentage;
    const progressClass = readyForNext ? 'vocab-ready' : 'vocab-not-ready';
    const message = readyForNext ? 
      '✅ Ready to advance to next lesson!' : 
      `Master ${8 - mastery.mastered} more words to advance`;
    
    progressDiv.innerHTML = `
      <h4>Vocabulary Progress</h4>
      <div class="vocab-stats">
        <div class="vocab-stat">
          <div class="number">${mastery.mastered}</div>
          <div class="label">Mastered</div>
        </div>
        <div class="vocab-stat">
          <div class="number">${mastery.total}</div>
          <div class="label">Total Words</div>
        </div>
        <div class="vocab-stat">
          <div class="number">${percentage}%</div>
          <div class="label">Progress</div>
        </div>
      </div>
      <div class="vocab-progress-bar">
        <div class="vocab-progress-fill" style="width: ${percentage}%"></div>
      </div>
      <div class="vocab-message ${progressClass}">${message}</div>
    `;
    
    progressDiv.classList.remove('hidden');
  }
  
  function showLearningMode(correctAnswer, item) {
    const hints = $('#hints');
    const explanation = $('#explanation');
    const answerArea = $('#answer-area');
    
    // Show the correct answer prominently
    hints.textContent = `Incorrect ❌`;
    hints.className = 'hints incorrect';
    
    // Create learning interface
    answerArea.innerHTML = '';
    
    const learningDiv = document.createElement('div');
    learningDiv.className = 'learning-mode';
    
    const correctAnswerText = Array.isArray(correctAnswer) ? correctAnswer.join(' or ') : correctAnswer;
    
    learningDiv.innerHTML = `
      <div class="correct-answer-display">
        <h4>Correct Answer:</h4>
        <div class="correct-answer">${correctAnswerText}</div>
      </div>
      <div class="learning-explanation">
        ${item.explanation || 'Study this answer and try to remember it.'}
      </div>
      <div class="learning-actions">
        <button id="practice-again" class="primary-btn">Practice This Again</button>
        <button id="continue-learning" class="ghost">Continue →</button>
      </div>
    `;
    
    answerArea.appendChild(learningDiv);
    
    // Add event listeners
    $('#practice-again').addEventListener('click', () => {
      // Reset the current question for immediate retry
      renderQuestion(item);
    });
    
    $('#continue-learning').addEventListener('click', () => {
      nextQuestion();
    });
  }
  
  function setupScriptHelpers(item, container) {
    // For Japanese and other multi-script languages
    if (item.scripts) {
      const scriptDiv = document.createElement('div');
      scriptDiv.className = 'script-helpers';
      
      if (item.scripts.hiragana) {
        const btn = document.createElement('button');
        btn.className = 'ghost';
        btn.textContent = `あ ${item.scripts.hiragana}`;
        btn.title = 'Show hiragana';
        btn.addEventListener('click', () => {
          const input = $('#answer-area input');
          if (input) {
            input.value = item.scripts.hiragana;
            input.focus();
          }
        });
        scriptDiv.appendChild(btn);
      }
      
      if (item.scripts.kanji) {
        const btn = document.createElement('button');
        btn.className = 'ghost';
        btn.textContent = `漢 ${item.scripts.kanji}`;
        btn.title = 'Show kanji';
        btn.addEventListener('click', () => {
          const input = $('#answer-area input');
          if (input) {
            input.value = item.scripts.kanji;
            input.focus();
          }
        });
        scriptDiv.appendChild(btn);
      }
      
      if (item.scripts.romanji) {
        const btn = document.createElement('button');
        btn.className = 'ghost';
        btn.textContent = `R ${item.scripts.romanji}`;
        btn.title = 'Show romanji';
        btn.addEventListener('click', () => {
          const input = $('#answer-area input');
          if (input) {
            input.value = item.scripts.romanji;
            input.focus();
          }
        });
        scriptDiv.appendChild(btn);
      }
      
      if (scriptDiv.children.length > 0) {
        container.appendChild(scriptDiv);
      }
    }
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

  // Old nav functionality removed - now handled by dropdown menu

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
  
  // Main navigation (track selection) event listeners
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Update active state
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      // Render content for selected track
      const track = e.target.dataset.track;
      if (track) {
        renderTrackContent(track);
        switchView('onboarding');
      }
    });
  });
  
  // Settings dropdown functionality
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsMenu = document.getElementById('settings-menu');
  
  settingsToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu?.classList.toggle('hidden');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!settingsToggle?.contains(e.target) && !settingsMenu?.contains(e.target)) {
      settingsMenu?.classList.add('hidden');
    }
  });
  
  // Settings dropdown items
  document.querySelectorAll('.dropdown-item[data-nav]').forEach(item => {
    item.addEventListener('click', async (e) => {
      const target = e.target.dataset.nav;
      if (target === 'stats') {
        await updateStatsProgress();
        switchView('stats');
      } else if (target === 'profile') {
        showWelcomeModal();
      }
      settingsMenu?.classList.add('hidden');
    });
  });

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

// --- Interactive Algorithm Components ---
function renderInteractiveDemo(demo) {
  const container = document.createElement('div');
  container.className = 'interactive-demo';
  
  if (demo.type === 'find_max_demo') {
    container.innerHTML = `
      <h3>🔍 Interactive Demo: Find Maximum</h3>
      <div class="demo-content">
        <p>Watch how we find the largest number step by step:</p>
        <div class="numbers-array" id="max-demo-array">
          ${demo.numbers.map((num, index) => `
            <div class="number-item" data-index="${index}">${num}</div>
          `).join('')}
        </div>
        <div class="demo-state">
          <span>Current largest: <span id="current-max">${demo.numbers[0]}</span></span>
          <span>Step: <span id="step-count">1</span></span>
        </div>
        <div class="demo-controls">
          <button id="start-demo" class="demo-btn">Start Demo</button>
          <button id="next-step" class="demo-btn" disabled>Next Step</button>
          <button id="reset-demo" class="demo-btn">Reset</button>
        </div>
      </div>
    `;
    
    // Add demo functionality
    setupMaxDemo(demo.numbers, container);
  }
  
  return container;
}

function setupMaxDemo(numbers, container) {
  let currentStep = 0;
  let currentMax = numbers[0];
  let demoActive = false;
  
  const startBtn = container.querySelector('#start-demo');
  const nextBtn = container.querySelector('#next-step');
  const resetBtn = container.querySelector('#reset-demo');
  const currentMaxSpan = container.querySelector('#current-max');
  const stepSpan = container.querySelector('#step-count');
  const numberItems = container.querySelectorAll('.number-item');
  
  startBtn.addEventListener('click', () => {
    demoActive = true;
    currentStep = 0;
    currentMax = numbers[0];
    startBtn.disabled = true;
    nextBtn.disabled = false;
    
    // Highlight first number
    numberItems.forEach(item => item.classList.remove('current', 'compared', 'max'));
    numberItems[0].classList.add('current', 'max');
  });
  
  nextBtn.addEventListener('click', () => {
    if (currentStep >= numbers.length - 1) return;
    
    currentStep++;
    const currentNumber = numbers[currentStep];
    
    // Clear previous highlights
    numberItems.forEach(item => item.classList.remove('current', 'compared'));
    
    // Highlight current number
    numberItems[currentStep].classList.add('current');
    
    // Compare and update
    if (currentNumber > currentMax) {
      // Remove max from previous
      numberItems.forEach(item => item.classList.remove('max'));
      currentMax = currentNumber;
      numberItems[currentStep].classList.add('max');
      currentMaxSpan.textContent = currentMax;
    }
    
    numberItems[currentStep].classList.add('compared');
    stepSpan.textContent = currentStep + 1;
    
    if (currentStep >= numbers.length - 1) {
      nextBtn.disabled = true;
      demoActive = false;
    }
  });
  
  resetBtn.addEventListener('click', () => {
    currentStep = 0;
    currentMax = numbers[0];
    demoActive = false;
    startBtn.disabled = false;
    nextBtn.disabled = true;
    currentMaxSpan.textContent = numbers[0];
    stepSpan.textContent = '1';
    numberItems.forEach(item => item.classList.remove('current', 'compared', 'max'));
  });
}

function renderPerformanceDemo(demo) {
  const container = document.createElement('div');
  container.className = 'performance-demo';
  
  container.innerHTML = `
    <h3>⚡ Performance Comparison</h3>
    <div class="algorithms-comparison">
      ${demo.algorithms.map(algo => `
        <div class="algorithm-card">
          <h4>${algo.name}</h4>
          <p>${algo.description}</p>
          <div class="complexity">${algo.time_complexity}</div>
          <div class="performance-data">
            ${Object.entries(algo.performance_data).map(([size, time]) => `
              <div class="perf-row">
                <span class="size">${size.replace('_', ' ')}</span>
                <span class="time">${time}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    ${demo.key_insight ? `<div class="performance-insight">💡 ${demo.key_insight}</div>` : ''}
  `;
  
  return container;
}

function renderBuildTogether(buildData) {
  const container = document.createElement('div');
  container.className = 'build-together';
  
  let content = '<h3>🔨 Build It Together</h3>';
  
  if (buildData.scenario) {
    content += `<div class="scenario"><strong>Scenario:</strong> ${buildData.scenario}</div>`;
  }
  
  if (buildData.step1) {
    content += `
      <div class="build-step">
        <h4>${buildData.step1.title}</h4>
        <p>${buildData.step1.description}</p>
        ${buildData.step1.pseudocode ? `
          <div class="pseudocode">
            <h5>Pseudocode:</h5>
            <pre>${buildData.step1.pseudocode.join('\n')}</pre>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  if (buildData.step2) {
    content += `
      <div class="build-step">
        <h4>${buildData.step2.title}</h4>
        ${buildData.step2.code_progression ? `
          <div class="code-progression">
            ${buildData.step2.code_progression.map((version, index) => `
              <div class="code-version">
                <h5>${version.title}</h5>
                <pre class="code-block"><code>${version.code}</code></pre>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  if (buildData.step3) {
    content += `
      <div class="build-step">
        <h4>${buildData.step3.title}</h4>
        ${buildData.step3.interactive_test ? `
          <div class="interactive-test">
            <div class="test-data">
              <h5>Test Data:</h5>
              <pre>${JSON.stringify(buildData.step3.interactive_test.contacts, null, 2)}</pre>
            </div>
            <div class="test-searches">
              <h5>Try these searches:</h5>
              ${buildData.step3.interactive_test.test_searches.map(search => `
                <button class="test-search-btn" data-search="${search}">${search}</button>
              `).join('')}
            </div>
            <div class="search-results" id="search-results"></div>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  container.innerHTML = content;
  
  // Add interactivity for test searches
  if (buildData.step3?.interactive_test) {
    setupSearchTest(container, buildData.step3.interactive_test);
  }
  
  return container;
}

function setupSearchTest(container, testData) {
  const buttons = container.querySelectorAll('.test-search-btn');
  const resultsDiv = container.querySelector('#search-results');
  
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const searchTerm = button.dataset.search;
      const contacts = testData.contacts;
      
      // Simulate linear search
      let steps = 0;
      let found = null;
      
      for (let i = 0; i < contacts.length; i++) {
        steps++;
        if (contacts[i].name === searchTerm) {
          found = contacts[i];
          break;
        }
      }
      
      resultsDiv.innerHTML = `
        <div class="search-result">
          <h5>Search for "${searchTerm}":</h5>
          ${found ? `
            <div class="result-found">✅ Found: ${found.name} - ${found.phone}</div>
            <div class="result-steps">Steps taken: ${steps}</div>
          ` : `
            <div class="result-not-found">❌ Not found</div>
            <div class="result-steps">Steps taken: ${steps} (searched entire list)</div>
          `}
        </div>
      `;
    });
  });
}

function renderAnalysis(analysis) {
  const container = document.createElement('div');
  container.className = 'algorithm-analysis';
  
  container.innerHTML = `
    <h3>📊 Performance Analysis</h3>
    <div class="analysis-grid">
      ${analysis.best_case ? `
        <div class="analysis-item">
          <h4>Best Case</h4>
          <p>${analysis.best_case}</p>
        </div>
      ` : ''}
      ${analysis.worst_case ? `
        <div class="analysis-item">
          <h4>Worst Case</h4>
          <p>${analysis.worst_case}</p>
        </div>
      ` : ''}
      ${analysis.average_case ? `
        <div class="analysis-item">
          <h4>Average Case</h4>
          <p>${analysis.average_case}</p>
        </div>
      ` : ''}
      ${analysis.time_complexity ? `
        <div class="analysis-item">
          <h4>Time Complexity</h4>
          <p>${analysis.time_complexity}</p>
        </div>
      ` : ''}
    </div>
  `;
  
  return container;
}

function renderPerformanceComparison(comparison) {
  const container = document.createElement('div');
  container.className = 'performance-comparison';
  
  container.innerHTML = `
    <h3>🏁 Performance Comparison</h3>
    ${comparison.linear_vs_binary ? `
      <div class="comparison-section">
        <h4>Linear Search vs Binary Search</h4>
        ${Object.entries(comparison.linear_vs_binary).map(([size, description]) => `
          <div class="comparison-row">
            <span class="size-label">${size.replace(/_/g, ' ')}</span>
            <span class="comparison-text">${description}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${comparison.real_world_impact ? `
      <div class="real-world-impact">
        <h4>Real-World Impact</h4>
        <p>${comparison.real_world_impact}</p>
      </div>
    ` : ''}
  `;
  
  return container;
}

function renderProgressCheck(progressCheck, itemId) {
  const container = document.createElement('div');
  container.className = 'progress-check';
  
  container.innerHTML = `
    <h3>🎯 Knowledge Check</h3>
    <div class="quiz-content">
      <div class="quiz-question">
        <h4>${progressCheck.question || progressCheck.prompt}</h4>
        ${progressCheck.scenario ? `<p class="quiz-scenario">${progressCheck.scenario}</p>` : ''}
      </div>
      
      ${progressCheck.options ? `
        <div class="quiz-options">
          ${progressCheck.options.map((option, index) => `
            <div class="quiz-option" data-option="${index}">
              <input type="radio" name="quiz-${itemId}" id="option-${index}" value="${option}">
              <label for="option-${index}">${option}</label>
            </div>
          `).join('')}
        </div>
        <button class="check-answer-btn" data-item-id="${itemId}">Check Answer</button>
      ` : ''}
      
      ${progressCheck.questions ? `
        <div class="multi-question-quiz">
          ${progressCheck.questions.map((q, qIndex) => `
            <div class="quiz-sub-question" data-q-index="${qIndex}">
              <h5>${q.question}</h5>
              <div class="sub-quiz-options">
                ${q.options ? q.options.map((option, oIndex) => `
                  <div class="quiz-option" data-option="${oIndex}">
                    <input type="radio" name="quiz-${itemId}-${qIndex}" id="q${qIndex}-option-${oIndex}" value="${option}">
                    <label for="q${qIndex}-option-${oIndex}">${option}</label>
                  </div>
                `).join('') : `
                  <textarea class="text-answer" placeholder="Type your answer here..." data-q-index="${qIndex}"></textarea>
                `}
              </div>
            </div>
          `).join('')}
          <button class="check-multi-answers-btn" data-item-id="${itemId}">Check All Answers</button>
        </div>
      ` : ''}
      
      <div class="quiz-feedback" id="quiz-feedback-${itemId}" style="display: none;"></div>
    </div>
  `;
  
  // Add event listeners
  const checkBtn = container.querySelector('.check-answer-btn');
  const checkMultiBtn = container.querySelector('.check-multi-answers-btn');
  
  if (checkBtn) {
    checkBtn.addEventListener('click', () => {
      checkSingleAnswer(container, progressCheck, itemId);
    });
  }
  
  if (checkMultiBtn) {
    checkMultiBtn.addEventListener('click', () => {
      checkMultipleAnswers(container, progressCheck, itemId);
    });
  }
  
  return container;
}

function checkSingleAnswer(container, progressCheck, itemId) {
  const selectedOption = container.querySelector(`input[name="quiz-${itemId}"]:checked`);
  const feedback = container.querySelector(`#quiz-feedback-${itemId}`);
  
  if (!selectedOption) {
    feedback.innerHTML = '<div class="feedback-error">Please select an answer.</div>';
    feedback.style.display = 'block';
    return;
  }
  
  const isCorrect = selectedOption.value === progressCheck.correct_answer;
  
  feedback.innerHTML = `
    <div class="feedback-result ${isCorrect ? 'correct' : 'incorrect'}">
      ${isCorrect ? '✅ Correct!' : '❌ Incorrect'}
    </div>
    <div class="feedback-explanation">
      ${progressCheck.explanation || progressCheck.feedback || ''}
    </div>
    ${!isCorrect && progressCheck.correct_answer ? `
      <div class="correct-answer-reveal">
        <strong>Correct answer:</strong> ${progressCheck.correct_answer}
      </div>
    ` : ''}
  `;
  feedback.style.display = 'block';
  
  // Disable further attempts
  container.querySelectorAll('input[type="radio"]').forEach(input => input.disabled = true);
  container.querySelector('.check-answer-btn').disabled = true;
}

function checkMultipleAnswers(container, progressCheck, itemId) {
  const feedback = container.querySelector(`#quiz-feedback-${itemId}`);
  let allCorrect = true;
  let results = [];
  
  progressCheck.questions.forEach((question, qIndex) => {
    if (question.options) {
      // Multiple choice question
      const selectedOption = container.querySelector(`input[name="quiz-${itemId}-${qIndex}"]:checked`);
      const isCorrect = selectedOption && selectedOption.value === question.correct_answer;
      allCorrect = allCorrect && isCorrect;
      
      results.push({
        question: question.question,
        correct: isCorrect,
        selected: selectedOption ? selectedOption.value : 'No answer',
        correctAnswer: question.correct_answer,
        explanation: question.explanation
      });
    } else {
      // Text answer question
      const textAnswer = container.querySelector(`textarea[data-q-index="${qIndex}"]`);
      const answer = textAnswer ? textAnswer.value.trim() : '';
      const isCorrect = answer.length > 0; // Basic check - just needs an answer
      
      results.push({
        question: question.question,
        correct: isCorrect,
        selected: answer || 'No answer provided',
        explanation: question.explanation
      });
    }
  });
  
  feedback.innerHTML = `
    <div class="multi-feedback-header ${allCorrect ? 'all-correct' : 'some-incorrect'}">
      ${allCorrect ? '🎉 All correct!' : '📚 Review your answers'}
    </div>
    <div class="feedback-results">
      ${results.map((result, index) => `
        <div class="result-item ${result.correct ? 'correct' : 'incorrect'}">
          <h5>Question ${index + 1}: ${result.correct ? '✅' : '❌'}</h5>
          <p><strong>Your answer:</strong> ${result.selected}</p>
          ${!result.correct && result.correctAnswer ? `
            <p><strong>Correct answer:</strong> ${result.correctAnswer}</p>
          ` : ''}
          ${result.explanation ? `
            <p><strong>Explanation:</strong> ${result.explanation}</p>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
  feedback.style.display = 'block';
  
  // Disable further attempts
  container.querySelectorAll('input[type="radio"]').forEach(input => input.disabled = true);
  container.querySelectorAll('textarea').forEach(textarea => textarea.disabled = true);
  container.querySelector('.check-multi-answers-btn').disabled = true;
}
