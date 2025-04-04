$(document).ready(() => {
    // Profile status management
    const statusOptions = {
        available: { class: 'available', text: 'Available' },
        busy: { class: 'busy', text: 'Busy' },
        away: { class: 'away', text: 'Away' }
    };

    $('.user-profile').on('click', function() {
        const currentStatus = $('.status-indicator').attr('class').split(' ')[1];
        const statusList = Object.keys(statusOptions);
        const currentIndex = statusList.indexOf(currentStatus);
        const nextIndex = (currentIndex + 1) % statusList.length;
        const nextStatus = statusList[nextIndex];
        
        $('.status-indicator')
            .removeClass(currentStatus)
            .addClass(nextStatus);
        
        $('.user-status').text(statusOptions[nextStatus].text);
    });

    // Theme toggle
    $('.profile-btn .fa-moon').on('click', function() {
        $('body').toggleClass('dark-theme');
        $(this).toggleClass('fa-moon fa-sun');
    });

    // Navigation with proper event delegation
    $(document).on('click', '.main-nav li a', function(e) {
        e.preventDefault();
        $('.main-nav li a').removeClass('active');
        $(this).addClass('active');
        const target = $(this).attr('href');
        $('.tab-content').removeClass('active');
        $(target).addClass('active');
        
        if (target === '#chat') {
            $('#voice_button').show();
        } else {
            $('#voice_button').hide();
            if (window.recognition && window.recognition.recording) {
                window.recognition.stop();
            }
        }

        if (target === '#calendar') {
            generateCalendar(currentCalendarDate);
            updateTime();
        } else if (target === '#files') {
            renderFileAttachments();
        }
    });

    // Core application variables
    let tasks = [];
    let fileAttachments = [];
    let activities = [];
    let pendingTask = null;
    let pendingDate = null;
    const monthNames = ["January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"];
    let currentCalendarDate = new Date();
    let reminderInterval;
    const REMINDER_MINUTES_BEFORE = 5;
    
    const APP_URL_MAP = {
        'zoom': 'https://zoom.us/join',
        'meet': 'https://meet.google.com',
        'teams': 'https://teams.microsoft.com',
        'slack': 'https://slack.com',
        'calendar': 'https://calendar.google.com',
        'webex': 'https://webex.com',
        'skype': 'https://skype.com'
    };

    // Initialize file upload system
    setupFileUpload();

    // File attachment handling
    function setupFileUpload() {
        const fileDropArea = $('#file_drop_area');
        const fileInput = $('#file_input');
        const filePreview = $('#file_preview');

        fileDropArea.on('click', () => fileInput.trigger('click'));
        
        fileDropArea.on('dragover', (e) => {
            e.preventDefault();
            fileDropArea.addClass('dragover');
        });

        fileDropArea.on('dragleave', () => fileDropArea.removeClass('dragover'));
        
        fileDropArea.on('drop', (e) => {
            e.preventDefault();
            fileDropArea.removeClass('dragover');
            handleFiles(e.originalEvent.dataTransfer.files);
        });

        fileInput.on('change', function() {
            if (this.files.length) {
                handleFiles(this.files);
                $(this).val('');
            }
        });

        $(document).on('click', '.remove-file-btn', function() {
            const fileId = $(this).data('id');
            fileAttachments = fileAttachments.filter(f => f.id !== fileId);
            $(`.file-item[data-id="${fileId}"]`).remove();
        });

        $(document).on('click', '.download-btn', function() {
            const fileId = $(this).data('id');
            const fileObj = fileAttachments.find(f => f.id === fileId);
            if (fileObj) {
                const url = URL.createObjectURL(fileObj.file);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileObj.name;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 0);
            }
        });

        $(document).on('click', '.delete-btn', function() {
            const fileId = $(this).data('id');
            if (confirm('Delete this file permanently?')) {
                fileAttachments = fileAttachments.filter(f => f.id !== fileId);
                renderFileAttachments();
            }
        });
    }

    function handleFiles(files) {
        const filePreview = $('#file_preview');
        filePreview.empty();

        Array.from(files).forEach((file, i) => {
            const fileId = Date.now() + i;
            const fileItem = $(`
                <div class="file-item" data-id="${fileId}">
                    <div class="file-info">
                        <i class="fas ${getFileIcon(file.type)}"></i>
                        <span class="file-name">${escapeHtml(file.name)}</span>
                        <span class="file-size">${formatFileSize(file.size)}</span>
                    </div>
                    <button class="remove-file-btn" data-id="${fileId}" aria-label="Remove file">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `);
            
            filePreview.append(fileItem);
            fileAttachments.push({ 
                id: fileId, 
                file: file,
                name: file.name,
                size: file.size,
                type: file.type,
                uploaded: false
            });
        });
    }

    function getFileIcon(type) {
        if (!type) return 'fa-file';
        if (type.match('image.*')) return 'fa-file-image';
        if (type.match('video.*')) return 'fa-file-video';
        if (type.match('audio.*')) return 'fa-file-audio';
        if (type.match('application/pdf')) return 'fa-file-pdf';
        if (type.match('application/msword') || 
            type.match('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
            return 'fa-file-word';
        }
        if (type.match('application/vnd.ms-excel') || 
            type.match('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
            return 'fa-file-excel';
        }
        if (type.match('application/vnd.ms-powerpoint') || 
            type.match('application/vnd.openxmlformats-officedocument.presentationml.presentation')) {
            return 'fa-file-powerpoint';
        }
        if (type.match('text.*')) return 'fa-file-alt';
        if (type.match('application/zip') || 
            type.match('application/x-rar-compressed') || 
            type.match('application/x-7z-compressed')) {
            return 'fa-file-archive';
        }
        return 'fa-file';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function renderFileAttachments() {
        const filesContainer = $('#files_container');
        filesContainer.empty();

        if (fileAttachments.length === 0) {
            filesContainer.html('<p class="no-files">No files attached yet.</p>');
            return;
        }

        const filesList = $('<div class="files-list"></div>');
        
        fileAttachments.forEach(file => {
            const fileItem = $(`
                <div class="file-card">
                    <div class="file-icon">
                        <i class="fas ${getFileIcon(file.type)}"></i>
                    </div>
                    <div class="file-details">
                        <div class="file-name">${escapeHtml(file.name)}</div>
                        <div class="file-meta">
                            <span class="file-size">${formatFileSize(file.size)}</span>
                            <span class="file-date">${new Date(file.id).toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="file-actions">
                        <button class="action-btn download-btn" data-id="${file.id}" aria-label="Download file">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="action-btn delete-btn" data-id="${file.id}" aria-label="Delete file">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `);
            
            filesList.append(fileItem);
        });

        filesContainer.append(filesList);
    }

    // Keyboard Shortcut: Ctrl+Space for Voice Commands
    $(document).on('keydown', function(e) {
        if (e.ctrlKey && e.code === 'Space') {
            e.preventDefault();
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition && recognition) {
                if ($('#voice_button').hasClass('recording')) {
                    recognition.stop();
                } else {
                    $('#voice_button').trigger('click');
                }
            }
        }
    });

    // Helper functions
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function toLocalDateTimeString(date) {
        if (!date) return '';
        const pad = n => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function initReminders() {
        if (!reminderInterval) {
            reminderInterval = setInterval(checkReminders, 10000);
        }
        
        if ('Notification' in window) {
            Notification.requestPermission();
        }
    }

    function checkReminders() {
        const now = new Date();
        tasks.forEach(task => {
            if (task.completed || task.notified) return;
            
            const timeDiff = task.deadline - now;
            const minutesDiff = Math.floor(timeDiff / (1000 * 60));
            
            if (minutesDiff <= REMINDER_MINUTES_BEFORE && minutesDiff > -1) {
                showReminder(task);
                task.notified = true;
            }
        });
    }

    function showReminder(task) {
        if (!task || !task.deadline) return;
        
        const localTime = task.deadline.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        
        let message = `⏰ Reminder: "${escapeHtml(task.text)}" at ${localTime}!`;
        
        if (task.link) {
            const hostname = new URL(task.link).hostname;
            message += `<br><div class="redirect-prompt">
                <button class="action-btn redirect-btn" data-link="${escapeHtml(task.link)}">
                    Open ${escapeHtml(hostname)}
                </button>
            </div>`;
        }

        appendMessage(message, 'assistant');
        
        if (Notification.permission === 'granted') {
            const notification = new Notification('Task Reminder', {
                body: task.text + (task.link ? ` - ${localTime}` : ` - ${localTime}`),
                icon: 'https://img.icons8.com/fluency/48/000000/clock--v1.png'
            });

            if (task.link) {
                notification.onclick = () => {
                    if (confirm(`Open ${new URL(task.link).hostname} now?`)) {
                        window.open(task.link, '_blank');
                    }
                };
            }
        }
    }

    // Calendar controls
    $('#prev_month').on('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        generateCalendar(currentCalendarDate);
    });

    $('#next_month').on('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        generateCalendar(currentCalendarDate);
    });

    // Task management with virtualization
    $('#add_task_button').on('click', () => {
        const taskText = $('#new_task_input').val().trim();
        const deadlineString = $('#task_deadline').val();
        
        if (taskText && deadlineString) {
            const [datePart, timePart] = deadlineString.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
            const deadline = new Date(year, month - 1, day, hours, minutes);
            
            if (isNaN(deadline.getTime())) {
                appendMessage("⚠️ Invalid date/time format! Use your local time.", 'assistant');
                return;
            }

            const { cleanText, detectedLink } = detectLinkInText(taskText);
            
            const task = {
                text: cleanText,
                deadline: deadline,
                id: Date.now(),
                notified: false,
                link: detectedLink,
                completed: false,
                completedAt: null
            };
            
            tasks.push(task);
            renderVirtualizedTaskList();
            $('#new_task_input').val('');
            $('#task_deadline').val('');
            
            if ($('#calendar').is(':visible')) {
                generateCalendar(currentCalendarDate);
            }
        }
    });

    function detectLinkInText(text) {
        if (!text) return { cleanText: '', detectedLink: null };
        
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = text.match(urlRegex);
        if (urlMatch) {
            return {
                cleanText: text.replace(urlRegex, '').trim(),
                detectedLink: urlMatch[0]
            };
        }

        const lowerText = text.toLowerCase();
        for (const [appName, appUrl] of Object.entries(APP_URL_MAP)) {
            if (lowerText.includes(appName)) {
                return {
                    cleanText: text,
                    detectedLink: appUrl
                };
            }
        }

        return { cleanText: text, detectedLink: null };
    }

    window.completeTask = function(taskText) {
        if (!taskText) return false;
        
        const taskToComplete = tasks.find(t => 
            t.text.toLowerCase().includes(taskText.toLowerCase()) && !t.completed
        );
        
        if (taskToComplete) {
            taskToComplete.completed = true;
            taskToComplete.completedAt = new Date();
            activities.push(taskToComplete);
            renderVirtualizedTaskList();
            renderVirtualizedActivityList();
            if ($('#calendar').is(':visible')) generateCalendar(currentCalendarDate);
            return true;
        }
        return false;
    };

    window.deleteTask = function(taskText) {
        if (!taskText) return;
        
        const index = tasks.findIndex(t => t.text === taskText);
        if (index > -1) {
            tasks.splice(index, 1);
            renderVirtualizedTaskList();
            if ($('#calendar').is(':visible')) generateCalendar(currentCalendarDate);
        }
    };

    // Virtualization for Task List
    function renderVirtualizedTaskList() {
        const container = $('#task_list');
        const scrollContainer = container.parent();
        container.empty();
        
        const itemHeight = 70;
        const containerHeight = scrollContainer.height();
        const scrollTop = scrollContainer.scrollTop();
        const visibleItems = Math.ceil(containerHeight / itemHeight) + 2;
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
        const endIndex = Math.min(tasks.length, startIndex + visibleItems);

        container.css('height', tasks.length * itemHeight + 'px');

        const activeTasks = tasks.filter(t => !t.completed);
        for (let i = startIndex; i < endIndex; i++) {
            if (i >= activeTasks.length) break;
            const task = activeTasks[i];
            if (!task) continue;
            
            const formattedDate = task.deadline.toLocaleString('en-US', {
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short'
            });
            const escapedText = escapeHtml(task.text);
            const hostname = task.link ? new URL(task.link).hostname : '';
            const taskItem = $(`
                <li data-id="${task.id}" class="${task.completed ? 'completed-task' : ''}" style="position: absolute; top: ${i * itemHeight}px; width: 100%;">
                    <div>${escapedText}</div>
                    ${task.link ? `<div class="task-link">🔗 ${escapeHtml(hostname)}</div>` : ''}
                    <div class="task-deadline">⏰ ${escapeHtml(formattedDate)}</div>
                    <div class="task-actions">
                        ${!task.completed ? 
                            `<button class="action-btn complete-btn" onclick="completeTask('${escapedText.replace(/'/g, "\\'")}')" aria-label="Complete task">
                                <i class="fas fa-check"></i>
                            </button>` : ''
                        }
                        <button class="action-btn" onclick="deleteTask('${escapedText.replace(/'/g, "\\'")}')" aria-label="Delete task">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </li>
            `);
            container.append(taskItem);
        }

        scrollContainer.off('scroll').on('scroll', renderVirtualizedTaskList);
    }

    // Virtualization for Activity List
    function renderVirtualizedActivityList() {
        const container = $('#activity_list');
        const scrollContainer = container.parent();
        container.empty();
        
        const itemHeight = 60;
        const containerHeight = scrollContainer.height();
        const scrollTop = scrollContainer.scrollTop();
        const visibleItems = Math.ceil(containerHeight / itemHeight) + 2;
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
        const endIndex = Math.min(activities.length, startIndex + visibleItems);

        container.css('height', activities.length * itemHeight + 'px');

        for (let i = startIndex; i < endIndex; i++) {
            const task = activities[i];
            if (!task) continue;
            
            const formattedTime = task.completedAt.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            });
            const activityItem = $(`
                <div class="activity-item" style="position: absolute; top: ${i * itemHeight}px; width: 100%;">
                    <i class="fas fa-check-circle activity-icon" style="color:#2ecc71"></i>
                    <div>
                        <span class="completed-task">${escapeHtml(task.text)}</span>
                        <span class="activity-time">${escapeHtml(formattedTime)}</span>
                    </div>
                </div>
            `);
            container.append(activityItem);
        }

        scrollContainer.off('scroll').on('scroll', renderVirtualizedActivityList);
    }

    // Chat functionality
    $('#send_button').on('click', handleChatInput);
    
    $('#message_input').on('keypress', function(e) {
        if (e.which === 13) {
            handleChatInput();
            return false;
        }
    });

    function handleChatInput() {
        const message = $('#message_input').val().trim();
        if (!message) return;

        appendMessage(message, 'user');
        processQuery(message);
        $('#message_input').val('');
    }

    function appendMessage(content, sender) {
        if (!content) return;
        
        const messageDiv = $(`
            <div class="chat-message ${sender}">
                ${content.replace(/\n/g, '<br>')}
            </div>
        `);
        
        $('#chat_history').append(messageDiv);
        $('#chat_history').scrollTop($('#chat_history')[0].scrollHeight);
    }

    function extractTaskText(query) {
        if (!query) return '';
        
        const patterns = [
            /(complete|finish|delete)\s(task\s)?(.+?)\s(on|due|for|at)/i,
            /(mark)\s(.+?)\s(as\s)?(completed|done)/i,
            /(complete|finish|delete)\s(.+)/i
        ];
        
        for (const pattern of patterns) {
            const match = query.match(pattern);
            if (match) return match[3] || match[2];
        }
        return query.replace(/complete|finish|mark|done|task|item/gi, '').trim();
    }

    function processQuery(query) {
        if (!query) return;
        
        const lowerQuery = query.toLowerCase();
        let response = "I can help with tasks, dates, and basic information. Try asking: 'What's due today?'";

        const detectedDate = detectDate(query);
        
        if (lowerQuery.includes('task') || lowerQuery.includes('due')) {
            if (detectedDate) {
                const tasksOnDate = tasks.filter(task => 
                    isSameDate(task.deadline, detectedDate) && !task.completed
                );
                
                response = tasksOnDate.length > 0 ?
                    `📅 Tasks on ${formatDateLong(detectedDate)}:\n${tasksOnDate.map(t => `• ${escapeHtml(t.text)}${t.link ? ' 🔗' : ''}`).join('\n')}` :
                    `No tasks scheduled for ${formatDateLong(detectedDate)}`;
            } else if (lowerQuery.includes('all')) {
                const activeTasks = tasks.filter(t => !t.completed);
                response = activeTasks.length > 0 ?
                    `📋 All Tasks:\n${activeTasks.map(t => `• ${escapeHtml(t.text)} (${formatDateLong(t.deadline)})${t.link ? ' 🔗' : ''}`).join('\n')}` :
                    "No active tasks found! Add your first task using the Tasks tab";
            }
        } else if (lowerQuery.includes('remove') || lowerQuery.includes('delete')) {
            const taskText = extractTaskText(query);
            const removedTasks = removeTasks(taskText, detectedDate);
            
            if (removedTasks.length > 0) {
                response = `🗑️ Removed ${removedTasks.length} task(s):\n${removedTasks.map(t => `• ${escapeHtml(t.text)}`).join('\n')}`;
                renderVirtualizedTaskList();
                if ($('#calendar').is(':visible')) generateCalendar(currentCalendarDate);
            } else {
                response = `No tasks found matching "${escapeHtml(taskText)}"${detectedDate ? ' on ' + formatDateLong(detectedDate) : ''}`;
            }
        } else if (lowerQuery.includes('complete') || lowerQuery.includes('finish') || lowerQuery.includes('mark as done')) {
            const taskText = extractTaskText(query);
            const success = completeTask(taskText);
            response = success ? 
                `✅ Completed task: "${escapeHtml(taskText)}"` :
                `⚠️ Couldn't find active task matching "${escapeHtml(taskText)}"`;
        } else if (lowerQuery.startsWith('open ')) {
            const searchText = query.substring(5).trim();
            const matchingTask = tasks.find(task => 
                task.text.toLowerCase().includes(searchText.toLowerCase()) && task.link
            );

            if (matchingTask) {
                const hostname = new URL(matchingTask.link).hostname;
                response = `🔗 Found link for "${escapeHtml(matchingTask.text)}":<br>
                    <button class="action-btn redirect-btn" data-link="${escapeHtml(matchingTask.link)}">
                        Open ${escapeHtml(hostname)}
                    </button>`;
            } else {
                response = `No links found related to "${escapeHtml(searchText)}"`;
            }
        } else if (lowerQuery.includes('time')) {
            response = `⏰ Current Local Time: ${new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            })}`;
        } else if (lowerQuery.includes('date')) {
            response = `📅 Today's Date: ${new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}`;
        } else if (lowerQuery.includes('joke')) {
            response = "🎭 Why did the developer go broke? Because he used up all his cache!";
        } else if (lowerQuery.includes('help')) {
            response = "🤖 I can help with:<br>• Task deadlines<br>• Date information<br>• Add/remove tasks<br>• Complete tasks (say 'complete [task]')<br>• Auto-open meeting links<br>Try: 'Complete report due Friday' or 'What's due today?'";
        }

        setTimeout(() => appendMessage(response, 'assistant'), 500);
    }

    function removeTasks(taskText, dateFilter) {
        const remainingTasks = [];
        const removedTasks = [];
        
        tasks.forEach(task => {
            if (task.text.toLowerCase().includes(taskText.toLowerCase()) &&
                (!dateFilter || isSameDate(task.deadline, dateFilter))) {
                removedTasks.push(task);
            } else {
                remainingTasks.push(task);
            }
        });
        
        tasks = remainingTasks;
        return removedTasks;
    }

    // Calendar generation with numbered tasks and time
    function generateCalendar(date) {
        if (!date) return;
        
        const month = date.getMonth();
        const year = date.getFullYear();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDay = new Date(year, month, 1).getDay();

        $('#calendar_header').html(`
            ${monthNames[month]} 
            <span class="calendar-year">${year}</span>
        `);
        
        let calendarHtml = '<div class="calendar-grid">';
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => 
            calendarHtml += `<div class="calendar-header">${day}</div>`
        );

        for (let i = 0; i < startDay; i++) {
            calendarHtml += '<div class="calendar-cell empty"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dayTasks = tasks.filter(task => 
                isSameDate(task.deadline, currentDate) && !task.completed
            ).sort((a, b) => a.deadline - b.deadline);

            calendarHtml += `
                <div class="calendar-cell${isSameDate(new Date(), currentDate) ? ' today' : ''}">
                    <div class="calendar-day">${day}</div>
                    <div class="task-list">
            `;
            
            dayTasks.forEach((task, index) => {
                if (!task) return;
                
                const time = task.deadline.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit'
                });
                calendarHtml += `
                    <div class="calendar-task">
                        <span class="task-number">${index + 1}.</span>
                        ${escapeHtml(task.text)}${task.link ? ' 🔗' : ''} 
                        <span class="task-time">(${escapeHtml(time)})</span>
                    </div>
                `;
            });
            
            calendarHtml += '</div></div>';
        }

        calendarHtml += '</div>';
        $('#calendar_table').html(calendarHtml);
    }

    // Enhanced date detection with improved time parsing
    function detectDate(text) {
        if (!text) return null;
        
        const datePatterns = [
            { 
                regex: /(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, 
                handler: (m) => {
                    const monthIndex = monthNames.findIndex(month => 
                        month.toLowerCase().startsWith(m[2].toLowerCase()));
                    if (monthIndex === -1) return null;
                    const timeData = parseTimeString(m[3]);
                    if (!timeData) return null;
                    const year = new Date().getFullYear();
                    return new Date(year, monthIndex, parseInt(m[1]), timeData.hours, timeData.minutes);
                }
            },
            { 
                regex: /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, 
                handler: (m) => {
                    const monthIndex = monthNames.findIndex(month => 
                        month.toLowerCase().startsWith(m[1].toLowerCase()));
                    if (monthIndex === -1) return null;
                    const timeData = parseTimeString(m[3]);
                    if (!timeData) return null;
                    const year = new Date().getFullYear();
                    return new Date(year, monthIndex, parseInt(m[2]), timeData.hours, timeData.minutes);
                }
            },
            { 
                regex: /(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)/i, 
                handler: (m) => {
                    const monthIndex = monthNames.findIndex(month => 
                        month.toLowerCase().startsWith(m[2].toLowerCase()));
                    if (monthIndex > -1) {
                        const year = new Date().getFullYear();
                        return new Date(year, monthIndex, parseInt(m[1]), 12);
                    }
                    return null;
                }
            },
            { 
                regex: /(\w+)\s+(\d{1,2})/i, 
                handler: (m) => {
                    const monthIndex = monthNames.findIndex(month => 
                        month.toLowerCase().startsWith(m[1].toLowerCase()));
                    if (monthIndex > -1) {
                        const year = new Date().getFullYear();
                        return new Date(year, monthIndex, parseInt(m[2]), 12);
                    }
                    return null;
                }
            },
            { 
                regex: /tomorrow\s+at?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, 
                handler: (m) => {
                    const timeData = parseTimeString(m[1]);
                    if (!timeData) return null;
                    const date = new Date();
                    date.setDate(date.getDate() + 1);
                    date.setHours(timeData.hours, timeData.minutes, 0, 0);
                    return date;
                }
            },
            { 
                regex: /tomorrow/i, 
                handler: () => {
                    const date = new Date();
                    date.setDate(date.getDate() + 1);
                    date.setHours(12, 0, 0, 0);
                    return date;
                }
            },
            { 
                regex: /today\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, 
                handler: (m) => {
                    const timeData = parseTimeString(m[1]);
                    if (!timeData) return null;
                    const date = new Date();
                    date.setHours(timeData.hours, timeData.minutes, 0, 0);
                    return date;
                }
            },
            { 
                regex: /today/i, 
                handler: () => new Date()
            },
            { 
                regex: /next\s+week\s+(\w+)(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i, 
                handler: (m) => {
                    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
                    const targetDay = m[1].toLowerCase();
                    const targetIndex = days.findIndex(d => d.startsWith(targetDay));
                    if (targetIndex === -1) return null;
                    
                    const date = new Date();
                    date.setDate(date.getDate() + 7); // Add 1 week
                    date.setDate(date.getDate() + ((targetIndex + 7 - date.getDay()) % 7));
                    
                    if (m[2]) {
                        const timeData = parseTimeString(m[2]);
                        if (timeData) {
                            date.setHours(timeData.hours, timeData.minutes, 0, 0);
                        }
                    }
                    return date;
                }
            },
            { 
                regex: /next\s+(\w+)(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, 
                handler: (m) => {
                    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
                    const targetDay = m[1].toLowerCase();
                    const targetIndex = days.findIndex(d => d.startsWith(targetDay));
                    if (targetIndex === -1) return null;
                    const timeData = parseTimeString(m[2]);
                    if (!timeData) return null;
                    const date = new Date();
                    date.setDate(date.getDate() + ((targetIndex + 7 - date.getDay()) % 7 || 7));
                    date.setHours(timeData.hours, timeData.minutes, 0, 0);
                    return date;
                }
            },
            { 
                regex: /next\s+(\w+)/i, 
                handler: (m) => {
                    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
                    const targetDay = m[1].toLowerCase();
                    const targetIndex = days.findIndex(d => d.startsWith(targetDay));
                    if (targetIndex === -1) return null;
                    const date = new Date();
                    date.setDate(date.getDate() + ((targetIndex + 7 - date.getDay()) % 7 || 7));
                    return date;
                }
            },
            { 
                regex: /in\s+(\d+)\s+days?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, 
                handler: (m) => {
                    const days = parseInt(m[1]);
                    const timeData = parseTimeString(m[2]);
                    if (!timeData) return null;
                    const date = new Date();
                    date.setDate(date.getDate() + days);
                    date.setHours(timeData.hours, timeData.minutes, 0, 0);
                    return date;
                }
            },
            { 
                regex: /in\s+(\d+)\s+days?/i, 
                handler: (m) => {
                    const days = parseInt(m[1]);
                    const date = new Date();
                    date.setDate(date.getDate() + days);
                    return date;
                }
            },
            { 
                regex: /(\d{1,2}\s*(?:am|pm))/i,
                handler: (m) => {
                    const timeData = parseTimeString(m[1]);
                    if (!timeData) return null;
                    const date = new Date();
                    date.setHours(timeData.hours, timeData.minutes, 0, 0);
                    return date;
                }
            },
            { 
                regex: /(\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
                handler: (m) => {
                    const timeData = parseTimeString(m[1]);
                    if (!timeData) return null;
                    const date = new Date();
                    date.setHours(timeData.hours, timeData.minutes, 0, 0);
                    return date;
                }
            },
            { 
                regex: /(\d{1,2}:\d{2})\s*(?:hrs|hours?)?/i,
                handler: (m) => {
                    const timeData = parseTimeString(m[1]);
                    if (!timeData) return null;
                    const date = new Date();
                    date.setHours(timeData.hours, timeData.minutes, 0, 0);
                    return date;
                }
            }
        ];

        for (const pattern of datePatterns) {
            const match = text.match(pattern.regex);
            if (match) {
                const date = pattern.handler(match);
                if (date) return date;
            }
        }
        return null;
    }

    // Enhanced time parsing for 12h/24h formats
    function parseTimeString(timeStr) {
        if (!timeStr) return null;
        
        const cleaned = timeStr.toLowerCase()
            .replace(/\s+/g, '')
            .replace(/\./g, '')
            .replace(/(am|pm)/, ' $1');

        const timeMatch = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
        
        if (!timeMatch) return null;

        let hours = parseInt(timeMatch[1], 10);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const period = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

        // Handle 24-hour format
        if (!period) {
            if (hours >= 0 && hours <= 23) {
                return { hours: hours % 24, minutes };
            }
            return null; // Invalid 24-hour time
        }

        // Handle 12-hour format
        if (period === 'pm' && hours !== 12) {
            hours += 12;
        } else if (period === 'am' && hours === 12) {
            hours = 0;
        }

        // Validate hours
        if (hours < 0 || hours > 23) return null;
        
        return { hours, minutes };
    }

    function isSameDate(date1, date2) {
        if (!date1 || !date2) return false;
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    function formatDateLong(date) {
        if (!date) return '';
        return date.toLocaleString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    function updateTime() {
        const now = new Date();
        $('#current_time').html(`
            Local Time: ${now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            })}<br>
            Date: ${now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}
        `);
        setTimeout(updateTime, 1000);
    }

    // Voice recognition with time request
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        $('#voice_button').hide();

        function checkMicrophonePermission() {
            return navigator.permissions.query({ name: 'microphone' })
                .then(permissionStatus => permissionStatus.state === 'granted')
                .catch(() => false);
        }

        recognition.onstart = () => {
            $('#voice_status').text('Listening...').addClass('active');
            $('#voice_button').addClass('recording');
            recognition.recording = true;
        };

        recognition.onend = () => {
            $('#voice_status').text('Click to speak').removeClass('active');
            $('#voice_button').removeClass('recording');
            recognition.recording = false;
        };

        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            appendMessage(transcript, 'user');
            await processVoiceCommand(transcript);
        };

        recognition.onerror = (event) => {
            let errorMessage = 'Error: ';
            switch (event.error) {
                case 'no-speech':
                    errorMessage = 'No speech detected. Try speaking louder.';
                    break;
                case 'audio-capture':
                    errorMessage = 'Microphone not found.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone access denied. Please allow microphone access.';
                    break;
                default:
                    errorMessage += event.error;
            }
            appendMessage(errorMessage, 'assistant');
            $('#voice_status').text('Error - try again').removeClass('active');
            $('#voice_button').removeClass('recording');
            recognition.recording = false;
        };

        $('#voice_button').on('click', async function() {
            try {
                if ($(this).hasClass('recording')) {
                    recognition.stop();
                    return;
                }

                const hasPermission = await checkMicrophonePermission();
                if (!hasPermission) {
                    try {
                        await navigator.mediaDevices.getUserMedia({ audio: true });
                    } catch (err) {
                        appendMessage('Please allow microphone access to use voice commands', 'assistant');
                        return;
                    }
                }

                $('#voice_status').removeClass('error');
                recognition.start();
            } catch (e) {
                console.error('Voice command error:', e);
                appendMessage('Error initializing voice commands. Try refreshing the page.', 'assistant');
            }
        });

        async function processVoiceCommand(transcript) {
            if (!transcript) return;
            
            const lowerTranscript = transcript.toLowerCase();
            
            if (lowerTranscript.includes('remove') || lowerTranscript.includes('delete')) {
                processQuery(transcript);
                return;
            }

            if (lowerTranscript.includes('complete') || lowerTranscript.includes('finish') || lowerTranscript.includes('mark as done')) {
                const taskText = extractTaskText(transcript);
                const success = completeTask(taskText);
                const response = success ? 
                    `✅ Completed task: "${escapeHtml(taskText)}"` :
                    `⚠️ Couldn't find active task matching "${escapeHtml(taskText)}"`;
                appendMessage(response, 'assistant');
                return;
            }

            const patterns = [
                { regex: /(?:add|create|schedule)\s+(.+?)\s+(?:due|by|on|for|at)\s+(.+)/i, groups: [1, 2] },
                { regex: /(.+?)\s+(?:due|by|on|for|at)\s+(.+)/i, groups: [1, 2] },
                { regex: /(?:set|make|remind me)\s+(.+?)\s+(?:at|for)\s+(.+)/i, groups: [1, 2] }
            ];

            let taskText = '';
            let deadline = null;

            for (const pattern of patterns) {
                const match = transcript.match(pattern.regex);
                if (match) {
                    taskText = match[pattern.groups[0]].trim();
                    const dateString = match[pattern.groups[1]].trim();
                    deadline = detectDate(dateString);
                    if (deadline) break;
                }
            }

            if (!taskText || !deadline) {
                deadline = detectDate(transcript);
                if (deadline) {
                    taskText = transcript.replace(/\b(?:add|create|schedule|set|make|remind me|due|by|on|for|at)\b/gi, '')
                                 .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+\w+\b|\b\w+\s+\d{1,2}\b|\btomorrow\b|\btoday\b|\bnext\s+\w+\b|\bin\s+\d+\s+days?\b|\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi, '')
                                 .trim();
                }
            }

            if (taskText && deadline) {
                const hasSpecificTime = deadline.getHours() !== 12 || deadline.getMinutes() !== 0 || transcript.toLowerCase().includes('am') || transcript.toLowerCase().includes('pm');
                if (!hasSpecificTime) {
                    pendingTask = taskText;
                    pendingDate = deadline;
                    appendMessage(`What time would you like "${escapeHtml(taskText)}" to be due on ${formatDateLong(deadline)}? Say something like "at 3 PM".`, 'assistant');
                } else {
                    $('#new_task_input').val(taskText);
                    $('#task_deadline').val(toLocalDateTimeString(deadline));
                    $('#add_task_button').trigger('click');
                    appendMessage(`✅ Added: "${escapeHtml(taskText)}" for ${formatDateLong(deadline)}`, 'assistant');
                    if (deadline.getMonth() !== currentCalendarDate.getMonth()) {
                        appendMessage(`Note: This task is in ${monthNames[deadline.getMonth()]}'s calendar`, 'assistant');
                    }
                }
            } else if (pendingTask && detectDate(transcript)) {
                const timeDate = detectDate(transcript);
                if (timeDate) {
                    pendingDate.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);
                    $('#new_task_input').val(pendingTask);
                    $('#task_deadline').val(toLocalDateTimeString(pendingDate));
                    $('#add_task_button').trigger('click');
                    appendMessage(`✅ Added: "${escapeHtml(pendingTask)}" for ${formatDateLong(pendingDate)}`, 'assistant');
                    if (pendingDate.getMonth() !== currentCalendarDate.getMonth()) {
                        appendMessage(`Note: This task is in ${monthNames[pendingDate.getMonth()]}'s calendar`, 'assistant');
                    }
                    pendingTask = null;
                    pendingDate = null;
                }
            } else {
                appendMessage("I couldn't understand the task details. Try saying: 'Add meeting tomorrow at 2 PM' or 'Create report due Friday'", 'assistant');
            }
        }
    } else {
        $('#voice_button').hide().after('<div class="warning">Voice commands not supported in this browser</div>');
        appendMessage('Your browser does not support voice commands. Try Chrome or Edge.', 'assistant');
    }

    // Initialize
    initReminders();
    generateCalendar(currentCalendarDate);
    updateTime();

    // Add this event handler for redirect buttons
    $(document).on('click', '.redirect-btn', function() {
        const link = $(this).data('link');
        if (link && confirm(`Open ${new URL(link).hostname} in new tab?`)) {
            window.open(link, '_blank');
        }
    });
});
