// scripts/content.js
// Логика парсинга данных с страницы Wordstat
// Отвечает за поиск таблицы, извлечение фраз и частотности, отправку данных в popup

// === СИСТЕМА ЛОГИРОВАНИЯ ===
const LOG_PREFIX = '[Wordstat Parser Content]';
const LOG_ENABLED = true; // Можно отключить для production

function log(...args) {
  if (LOG_ENABLED) {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    console.log(`${LOG_PREFIX} [${timestamp}]`, ...args);
  }
}

function logError(...args) {
  if (LOG_ENABLED) {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    console.error(`${LOG_PREFIX} [ERROR ${timestamp}]`, ...args);
  }
}

function logWarn(...args) {
  if (LOG_ENABLED) {
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    console.warn(`${LOG_PREFIX} [WARN ${timestamp}]`, ...args);
  }
}

(() => {
  log('=== Content Script Initialized ===');
  log('DOM Ready State:', document.readyState);
  log('Current URL:', window.location.href);

  // Функция для очистки числа от пробелов (например, "12 345" -> 12345)
  function cleanNumber(str) {
    const result = str.replace(/\s/g, '');
    log('cleanNumber:', { input: str, output: result });
    return result;
  }
  
  // Функция парсинга таблицы Wordstat
  function parseWordstatData() {
    log('parseWordstatData: Starting parsing...');
    const results = [];
    
    // Ищем таблицу с результатами
    // Wordstat использует разные селекторы, пробуем несколько вариантов
    const tableSelectors = [
      '.b-table__row',           // Современный селектор строк таблицы
      'table tr',                // Универсальный селектор
      '.results-table tr',       // Альтернативный селектор
      '[class*="table"] tr',     // Селектор по частичному совпадению класса
      '.wordstat table tbody tr', // Специфичный селектор для новой версии
      '.b-word-statistics__row'  // Альтернативный селектор
    ];

    let rows = null;
    let usedSelector = '';
    
    for (const selector of tableSelectors) {
      rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        usedSelector = selector;
        log(`parseWordstatData: Found ${rows.length} rows using selector: "${selector}"`);
        break;
      }
    }

    if (!rows || rows.length === 0) {
      logWarn('parseWordstatData: No table found with any selector');
      logWarn('parseWordstatData: Available tables:', document.querySelectorAll('table').length);
      
      // Логируем структуру DOM для отладки
      const mainContainers = document.querySelectorAll('[class*="word"], [class*="stat"], [class*="table"]');
      log('parseWordstatData: Potential containers:', mainContainers.length);
      mainContainers.forEach((el, idx) => {
        log(`  Container ${idx}:`, el.tagName, el.className?.substring(0, 100));
      });
      
      return results;
    }

    log(`parseWordstatData: Processing ${rows.length} rows...`);
    
    // Проходим по каждой строке таблицы
    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('td');
      
      // Пропускаем строки без ячеек или заголовки
      if (cells.length < 2) {
        if (index < 5) log(`parseWordstatData: Skipping row ${index} - insufficient cells (${cells.length})`);
        return;
      }
      
      // Первая ячейка - запрос, вторая - частотность
      const phraseCell = cells[0];
      const frequencyCell = cells[1];
      
      if (!phraseCell || !frequencyCell) {
        if (index < 5) log(`parseWordstatData: Skipping row ${index} - missing cells`);
        return;
      }
      
      const phrase = phraseCell.textContent.trim();
      const frequencyRaw = frequencyCell.textContent.trim();
      const frequency = cleanNumber(frequencyRaw);
      
      // Проверка: частотность должна быть числом
      if (phrase && /^\d+$/.test(frequency)) {
        const parsedItem = {
          phrase: phrase,
          frequency: parseInt(frequency, 10)
        };
        results.push(parsedItem);
        if (index < 3) log(`parseWordstatData: Parsed row ${index}:`, parsedItem);
      } else {
        if (index < 3) log(`parseWordstatData: Invalid data in row ${index}:`, { phrase, frequencyRaw, frequency });
      }
    });

    log(`parseWordstatData: Completed. Total valid rows: ${results.length}`);
    return results;
  }

  // Функция для ожидания загрузки контента
  async function waitForContent(maxAttempts = 10, delay = 500) {
    log(`waitForContent: Starting with maxAttempts=${maxAttempts}, delay=${delay}ms`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log(`waitForContent: Attempt ${attempt}/${maxAttempts}`);
      
      const data = parseWordstatData();
      
      if (data.length > 0) {
        log(`waitForContent: Success! Found ${data.length} items on attempt ${attempt}`);
        return data;
      }
      
      if (attempt < maxAttempts) {
        log(`waitForContent: No data yet, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    logWarn(`waitForContent: Max attempts reached. Returning ${0} items.`);
    return [];
  }

  // Обработчик сообщений от popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('=== Message Received ===');
    log('Message:', request);
    log('Sender:', sender);
    
    if (request.action === 'parseData') {
      log('Handling parseData request...');
      
      // Ждем загрузки контента и возвращаем результат
      waitForContent()
        .then(data => {
          log('parseData completed successfully:', { itemCount: data.length });
          sendResponse({ success: true, data: data, timestamp: new Date().toISOString() });
        })
        .catch(error => {
          logError('parseData failed with error:', error);
          sendResponse({ success: false, error: error.message, timestamp: new Date().toISOString() });
        });
      
      // Возвращаем true, чтобы указать на асинхронный ответ
      return true;
    }
    
    log('Unknown action:', request.action);
    return false;
  });

  // Автоматический парсинг при загрузке страницы (для отладки)
  log('Content script fully loaded and ready');
  log('Listening for messages from popup...');
  
  // Сообщаем background о готовности (если нужно)
  log('Script initialization complete');
})();
