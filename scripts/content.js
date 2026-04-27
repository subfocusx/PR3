// scripts/content.js
// Логика парсинга данных с страницы Wordstat
// Отвечает за поиск таблицы, извлечение фраз и частотности, отправку данных в popup

(() => {
  // Функция для очистки числа от пробелов (например, "12 345" -> 12345)
  function cleanNumber(str) {
    return str.replace(/\s/g, '');
  }

  // Функция парсинга таблицы Wordstat
  function parseWordstatData() {
    const results = [];
    
    // Ищем таблицу с результатами
    // Wordstat использует разные селекторы, пробуем несколько вариантов
    const tableSelectors = [
      '.b-table__row',           // Современный селектор строк таблицы
      'table tr',                // Универсальный селектор
      '.results-table tr',       // Альтернативный селектор
      '[class*="table"] tr'      // Селектор по частичному совпадению класса
    ];

    let rows = null;
    for (const selector of tableSelectors) {
      rows = document.querySelectorAll(selector);
      if (rows.length > 0) break;
    }

    if (!rows || rows.length === 0) {
      console.warn('Wordstat Parser: Таблица с результатами не найдена');
      return results;
    }

    // Проходим по каждой строке таблицы
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      
      // Пропускаем строки без ячеек или заголовки
      if (cells.length < 2) return;
      
      // Первая ячейка - запрос, вторая - частотность
      const phraseCell = cells[0];
      const frequencyCell = cells[1];
      
      if (!phraseCell || !frequencyCell) return;
      
      const phrase = phraseCell.textContent.trim();
      const frequencyRaw = frequencyCell.textContent.trim();
      const frequency = cleanNumber(frequencyRaw);
      
      // Проверка: частотность должна быть числом
      if (phrase && /^\d+$/.test(frequency)) {
        results.push({
          phrase: phrase,
          frequency: parseInt(frequency, 10)
        });
      }
    });

    return results;
  }

  // Функция для ожидания загрузки контента
  function waitForContent(maxAttempts = 10, delay = 500) {
    return new Promise((resolve) => {
      let attempts = 0;
      
      const check = () => {
        attempts++;
        const data = parseWordstatData();
        
        if (data.length > 0 || attempts >= maxAttempts) {
          resolve(data);
        } else {
          setTimeout(check, delay);
        }
      };
      
      check();
    });
  }

  // Обработчик сообщений от popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'parseData') {
      // Ждем загрузки контента и возвращаем результат
      waitForContent().then(data => {
        sendResponse({ success: true, data: data });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      
      // Возвращаем true, чтобы указать на асинхронный ответ
      return true;
    }
  });

  // Автоматический парсинг при загрузке страницы (для отладки)
  console.log('Wordstat Parser: Content script loaded');
})();
