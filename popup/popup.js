// popup/popup.js
// Логика интерфейса popup
// Отвечает за обработку клика по кнопке, отправку запроса content script и скачивание CSV

// === СИСТЕМА ЛОГИРОВАНИЯ ===
const LOG_PREFIX = '[Wordstat Parser Popup]';
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

document.addEventListener('DOMContentLoaded', () => {
  log('=== Popup Initialized ===');
  
  const collectBtn = document.getElementById('collectBtn');
  const statusDiv = document.getElementById('status');
  const statsDiv = document.getElementById('stats');
  const countPhrasesEl = document.getElementById('countPhrases');
  const totalFrequencyEl = document.getElementById('totalFrequency');
  
  // Проверяем наличие элементов
  log('DOM Elements:', {
    collectBtn: !!collectBtn,
    statusDiv: !!statusDiv,
    statsDiv: !!statsDiv,
    countPhrasesEl: !!countPhrasesEl,
    totalFrequencyEl: !!totalFrequencyEl
  });

  // Функция отображения статуса
  function showStatus(message, type = 'info') {
    log('showStatus:', { message, type });
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
  }

  // Функция скрытия статуса
  function hideStatus() {
    log('hideStatus called');
    statusDiv.style.display = 'none';
  }

  // Функция отображения статистики
  function showStats(data) {
    log('showStats called with', data.length, 'items');
    const count = data.length;
    const total = data.reduce((sum, item) => sum + item.frequency, 0);
    
    countPhrasesEl.textContent = count;
    totalFrequencyEl.textContent = total.toLocaleString('ru-RU');
    statsDiv.style.display = 'block';
    
    log('Stats displayed:', { count, total });
  }

  // Функция создания CSV файла и скачивания
  function downloadCSV(data) {
    log('downloadCSV called with', data.length, 'items');
    
    if (!data || data.length === 0) {
      logWarn('downloadCSV: No data to export');
      showStatus('Нет данных для экспорта', 'error');
      return;
    }

    // Формируем CSV контент с BOM для корректного отображения кириллицы в Excel
    const BOM = '\uFEFF';
    const headers = ['Фраза', 'Частотность'];
    const rows = data.map(item => {
      // Экранируем кавычки и оборачиваем текст в кавычки если есть запятые
      const phrase = `"${item.phrase.replace(/"/g, '""')}"`;
      const frequency = item.frequency;
      return `${phrase},${frequency}`;
    });

    const csvContent = BOM + [headers.join(','), ...rows].join('\n');
    
    log('CSV generated:', { 
      totalChars: csvContent.length, 
      rows: data.length,
      sampleRow: rows[0]?.substring(0, 50)
    });
    
    // Создаем blob и ссылку для скачивания
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    log('Blob created:', { size: blob.size, type: blob.type });
    
    // Создаем временную ссылку и инициируем скачивание
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `wordstat_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    log('Download initiated:', filename);
    
    // Освобождаем память
    URL.revokeObjectURL(url);
    log('Blob URL revoked');
    
    showStatus(`Успешно! Скачано ${data.length} фраз`, 'success');
  }

  // Обработчик клика по кнопке
  collectBtn.addEventListener('click', async () => {
    log('=== Collect Button Clicked ===');
    
    // Блокируем кнопку на время выполнения
    collectBtn.disabled = true;
    hideStatus();
    statsDiv.style.display = 'none';
    showStatus('Парсинг данных...', 'info');

    try {
      log('Querying active tab...');
      // Получаем активную вкладку
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      log('Active tab:', { 
        id: tab.id, 
        url: tab.url?.substring(0, 80), 
        title: tab.title?.substring(0, 50) 
      });

      // Проверяем, что мы на нужном сайте
      if (!tab.url || !tab.url.includes('wordstat.yandex.ru')) {
        logError('Not on wordstat.yandex.ru');
        showStatus('Откройте страницу wordstat.yandex.ru', 'error');
        collectBtn.disabled = false;
        return;
      }

      log('Sending message to content script...');
      // Отправляем сообщение content script для парсинга
      const startTime = Date.now();
      
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'parseData' });
        const endTime = Date.now();
        
        log('Response received in', (endTime - startTime), 'ms:', response);

        if (response.success && response.data) {
          log('Parse successful:', { itemCount: response.data.length });
          
          if (response.data.length === 0) {
            showStatus('Данные не найдены. Обновите страницу.', 'error');
          } else {
            showStats(response.data);
            downloadCSV(response.data);
          }
        } else {
          logError('Parse failed:', response.error);
          showStatus(response.error || 'Ошибка при парсинге', 'error');
        }
      } catch (messageError) {
        logError('Message sending error:', messageError);
        
        // Специфичная обработка ошибки "Receiving end does not exist"
        if (messageError.message.includes('Receiving end does not exist')) {
          logWarn('Content script not found. Attempting to inject...');
          showStatus('Скрипт не найден. Обновите страницу (F5).', 'error');
          
          // Пытаемся инъектировать скрипт вручную
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['scripts/content.js']
            });
            log('Script injected successfully. Please try again.');
            showStatus('Скрипт загружен. Нажмите кнопку ещё раз.', 'info');
          } catch (injectError) {
            logError('Script injection failed:', injectError);
            showStatus('Ошибка инъекции скрипта: ' + injectError.message, 'error');
          }
        } else {
          throw messageError;
        }
      }
    } catch (error) {
      logError('General error:', error);
      logError('Error stack:', error.stack);
      showStatus('Ошибка: ' + error.message, 'error');
    } finally {
      // Разблокируем кнопку
      collectBtn.disabled = false;
      log('Button re-enabled');
    }
  });
  
  log('Popup event listeners attached');
});
