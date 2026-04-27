// popup/popup.js
// Логика интерфейса popup
// Отвечает за обработку клика по кнопке, отправку запроса content script и скачивание CSV

document.addEventListener('DOMContentLoaded', () => {
  const collectBtn = document.getElementById('collectBtn');
  const statusDiv = document.getElementById('status');
  const statsDiv = document.getElementById('stats');
  const countPhrasesEl = document.getElementById('countPhrases');
  const totalFrequencyEl = document.getElementById('totalFrequency');

  // Функция отображения статуса
  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
  }

  // Функция скрытия статуса
  function hideStatus() {
    statusDiv.style.display = 'none';
  }

  // Функция отображения статистики
  function showStats(data) {
    const count = data.length;
    const total = data.reduce((sum, item) => sum + item.frequency, 0);
    
    countPhrasesEl.textContent = count;
    totalFrequencyEl.textContent = total.toLocaleString('ru-RU');
    statsDiv.style.display = 'block';
  }

  // Функция создания CSV файла и скачивания
  function downloadCSV(data) {
    if (!data || data.length === 0) {
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
    
    // Создаем blob и ссылку для скачивания
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Создаем временную ссылку и инициируем скачивание
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wordstat_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Освобождаем память
    URL.revokeObjectURL(url);
    
    showStatus(`Успешно! Скачано ${data.length} фраз`, 'success');
  }

  // Обработчик клика по кнопке
  collectBtn.addEventListener('click', async () => {
    // Блокируем кнопку на время выполнения
    collectBtn.disabled = true;
    hideStatus();
    statsDiv.style.display = 'none';
    showStatus('Парсинг данных...', 'info');

    try {
      // Получаем активную вкладку
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Проверяем, что мы на нужном сайте
      if (!tab.url || !tab.url.includes('wordstat.yandex.ru')) {
        showStatus('Откройте страницу wordstat.yandex.ru', 'error');
        collectBtn.disabled = false;
        return;
      }

      // Отправляем сообщение content script для парсинга
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'parseData' });

      if (response.success && response.data) {
        if (response.data.length === 0) {
          showStatus('Данные не найдены. Обновите страницу.', 'error');
        } else {
          showStats(response.data);
          downloadCSV(response.data);
        }
      } else {
        showStatus(response.error || 'Ошибка при парсинге', 'error');
      }
    } catch (error) {
      console.error('Wordstat Parser Error:', error);
      showStatus('Ошибка: ' + error.message, 'error');
    } finally {
      // Разблокируем кнопку
      collectBtn.disabled = false;
    }
  });
});
