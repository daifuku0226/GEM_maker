document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        currentStep: 1,
        chatHistory: [],
        gemInstruction: '',
        notebookData: null,
        uploadedDocs: [] // アップロード資料（全文＋NotebookLM素材）
    };

    // Elements
    const elements = {
        stepNavItems: document.querySelectorAll('.step-item'),
        stepSections: document.querySelectorAll('.step-content'),
        
        // Step 1
        chatMessages: document.getElementById('chat-messages'),
        chatInput: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn'),
        typingIndicator: document.getElementById('typing-indicator'),
        completionMessage: document.getElementById('completion-message'),
        generateGemBtn: document.getElementById('generate-gem-btn'),
        
        // Step 2
        gemLoading: document.getElementById('gem-loading'),
        gemResult: document.getElementById('gem-result'),
        gemTextarea: document.getElementById('gem-textarea'),
        copyGemBtn: document.getElementById('copy-gem-btn'),
        wantEditBtn: document.getElementById('want-edit-btn'),
        editInputArea: document.getElementById('edit-input-area'),
        editRequestInput: document.getElementById('edit-request-input'),
        regenerateBtn: document.getElementById('re-generate-btn'),
        goStep3Btn: document.getElementById('go-step3-btn'),
        
        // Step 3
        step3CopyBtn: document.getElementById('step3-copy-btn'),
        backToStep2Btn: document.getElementById('back-to-step2-btn'),
        goStep4Btn: document.getElementById('go-step4-btn'),
        
        // Step 4
        notebookLoading: document.getElementById('notebook-loading'),
        notebookResult: document.getElementById('notebook-result'),
        notebookNames: document.getElementById('notebook-names'),
        tableBody: document.getElementById('table-body'),
        copyAllTableBtn: document.getElementById('copy-all-table-btn'),
        tipsContainer: document.getElementById('tips-container'),

        // Upload (共通UI)
        uploadTriggerBtn: document.getElementById('upload-trigger-btn'),
        fileInput: document.getElementById('file-input')
    };

    // ====== Conversation History: Load from localStorage ======
    function loadChatHistory() {
        const saved = localStorage.getItem('gem_maker_chat_history');
        if (!saved) return;

        try {
            const history = JSON.parse(saved);
            state.chatHistory = history;

            history.forEach(msg => {
                const role = msg.role === 'assistant' ? 'AI' : 'user';
                addMessage(role, msg.content, true); // silent mode
            });
        } catch (e) {
            console.error('履歴の読み込みに失敗:', e);
        }
    }

    // Initialize
    goToStep(1);
    loadChatHistory();

    if (state.chatHistory.length === 0) {
        addMessage('AI', 'こんにちは！今日はどんな業務を楽にしたいですか？まずは、一番「面倒だな」「時間がかかるな」と感じている仕事を気軽に教えてください 😊');
    }

    // Navigation
    elements.stepNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const step = parseInt(item.dataset.step);
            goToStep(step);
        });
    });

    function goToStep(step) {
        state.currentStep = step;
        
        elements.stepNavItems.forEach(item => {
            if (parseInt(item.dataset.step) === step) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        elements.stepSections.forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`step${step}`).classList.add('active');

        // STEP4 に入るとき、アップロード済みNotebookデータがあればそれを表示
        if (step === 4 && state.notebookData) {
            renderNotebookData();
            elements.notebookLoading.classList.add('hidden');
            elements.notebookResult.classList.remove('hidden');
        }
    }

    // ========== STEP 1: Chat ==========
    function addMessage(role, text, silent = false) {
        if (!silent) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${role === 'AI' ? 'ai' : 'user'}`;
            
            let displayHtml = text;
            const completionFlag = '【ヒアリング完了】';
            if (text.includes(completionFlag)) {
                displayHtml = text.replace(completionFlag, '').trim();
                handleCompletion();
            }
            
            const icon = role === 'AI' ? '🤖 ' : '👤 ';
            msgDiv.innerHTML = `<span class="message-icon">${icon}</span>${displayHtml}`;
            
            elements.chatMessages.appendChild(msgDiv);
            elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
        }

        state.chatHistory.push({ 
            role: role === 'AI' ? 'assistant' : 'user', 
            content: text 
        });

        localStorage.setItem('gem_maker_chat_history', JSON.stringify(state.chatHistory));
    }

    function handleCompletion() {
        elements.completionMessage.classList.remove('hidden');
        elements.generateGemBtn.classList.remove('hidden');
        elements.chatInput.disabled = true;
        elements.sendBtn.disabled = true;
    }

    async function sendMessage() {
        const text = elements.chatInput.value.trim();
        if (!text) return;

        addMessage('user', text);
        elements.chatInput.value = '';
        
        elements.typingIndicator.classList.remove('hidden');
        elements.sendBtn.disabled = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: state.chatHistory })
            });
            const data = await response.json();
            
            elements.typingIndicator.classList.add('hidden');
            elements.sendBtn.disabled = false;
            
            if (data.reply) {
                addMessage('AI', data.reply);
            } else {
                addMessage('AI', 'エラーが発生しました。もう一度お試しください。');
            }
        } catch (error) {
            elements.typingIndicator.classList.add('hidden');
            elements.sendBtn.disabled = false;
            addMessage('AI', 'ネットワークエラーが発生しました。');
        }
    }

    elements.sendBtn.addEventListener('click', sendMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // ========== STEP 2: GEM Generation ==========
    elements.generateGemBtn.addEventListener('click', () => {
        goToStep(2);
        generateGem();
    });

    async function generateGem(editRequest = null) {
        elements.gemResult.classList.add('hidden');
        elements.gemLoading.classList.remove('hidden');
        elements.editInputArea.classList.add('hidden');

        if (editRequest) {
            state.chatHistory.push({ role: 'assistant', content: state.gemInstruction });
            state.chatHistory.push({ role: 'user', content: `以下の通り、現在の指示書を修正してください。\n${editRequest}` });
        }

        try {
            const response = await fetch('/api/generate-gem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatHistory: state.chatHistory })
            });
            const data = await response.json();
            
            elements.gemLoading.classList.add('hidden');
            
            if (data.gem) {
                state.gemInstruction = data.gem;
                elements.gemTextarea.value = state.gemInstruction;
                elements.gemResult.classList.remove('hidden');
            } else {
                alert('GEM指示書の生成に失敗しました。');
            }
        } catch (error) {
            elements.gemLoading.classList.add('hidden');
            alert('通信エラーが発生しました。');
        }
    }

    function copyToClipboard(text, btnElement, successText = '✅ コピー完了', originalText = '📋 コピー') {
        navigator.clipboard.writeText(text).then(() => {
            btnElement.textContent = successText;
            setTimeout(() => {
                btnElement.textContent = originalText;
            }, 2000);
        });
    }

    elements.copyGemBtn.addEventListener('click', () => {
        copyToClipboard(elements.gemTextarea.value, elements.copyGemBtn, '✅ コピー完了', '📋 全文コピー');
    });

    elements.gemTextarea.addEventListener('input', (e) => {
        state.gemInstruction = e.target.value;
    });

    elements.wantEditBtn.addEventListener('click', () => {
        elements.editInputArea.classList.toggle('hidden');
    });

    elements.regenerateBtn.addEventListener('click', () => {
        const req = elements.editRequestInput.value.trim();
        if (req) {
            generateGem(req);
            elements.editRequestInput.value = '';
        }
    });

    elements.goStep3Btn.addEventListener('click', () => {
        state.gemInstruction = elements.gemTextarea.value; 
        goToStep(3);
    });

    // ========== STEP 3: Guide ==========
    elements.step3CopyBtn.addEventListener('click', () => {
        copyToClipboard(state.gemInstruction, elements.step3CopyBtn, '✅ コピー完了', '📋 指示書をコピーする');
    });

    elements.backToStep2Btn.addEventListener('click', () => {
        goToStep(2);
    });

    elements.goStep4Btn.addEventListener('click', () => {
        goToStep(4);
        // すでにアップロード由来の notebookData があればそれを使う
        if (!state.notebookData) {
            generateNotebookData();
        }
    });

    // ========== STEP 4: NotebookLM ==========
    async function generateNotebookData() {
        elements.notebookResult.classList.add('hidden');
        elements.notebookLoading.classList.remove('hidden');

        try {
            const response = await fetch('/api/generate-notebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gemInstruction: state.gemInstruction })
            });
            const data = await response.json();
            
            if (data.notebook_names) {
                state.notebookData = data;
                renderNotebookData();
                elements.notebookLoading.classList.add('hidden');
                elements.notebookResult.classList.remove('hidden');
            } else {
                elements.notebookLoading.classList.add('hidden');
                alert('データ生成に失敗しました。設定を見直してください。');
            }
        } catch (error) {
            elements.notebookLoading.classList.add('hidden');
            alert('通信エラーが発生しました。AIのJSON返却形式エラーの可能性があります。');
        }
    }

    function renderNotebookData() {
        if (!state.notebookData) return;

        // Names
        elements.notebookNames.innerHTML = '';
        state.notebookData.notebook_names.forEach(name => {
            const div = document.createElement('div');
            div.className = 'name-sample';
            div.innerHTML = `
                <span>${name}</span>
                <button class="btn btn-sm btn-outline copy-name-btn" data-name="${name}">📋 コピー</button>
            `;
            elements.notebookNames.appendChild(div);
        });

        // Table
        elements.tableBody.innerHTML = '';
        state.notebookData.sources.forEach(source => {
            const row = document.createElement('tr');
            
            let pClass = 'green';
            if (source.priority && source.priority.includes('必須')) pClass = 'red';
            else if (source.priority && source.priority.includes('推奨')) pClass = 'yellow';
            
            row.innerHTML = `
                <td>${source.category || ''}</td>
                <td>${source.content || ''}</td>
                <td>${source.format || ''}</td>
                <td>${source.example || ''}</td>
                <td><span class="badge ${pClass}">${source.priority || ''}</span></td>
                <td><button class="btn btn-sm btn-outline copy-row-btn" data-content="${source.content || ''}">📋</button></td>
            `;
            elements.tableBody.appendChild(row);
        });

        // Tips
        elements.tipsContainer.innerHTML = '';
        state.notebookData.tips.forEach(tip => {
            const div = document.createElement('div');
            div.className = 'tip-card';
            div.textContent = tip;
            elements.tipsContainer.appendChild(div);
        });

        document.querySelectorAll('.copy-name-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                copyToClipboard(e.target.dataset.name, e.target, '✅', '📋 コピー');
            });
        });

        document.querySelectorAll('.copy-row-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                copyToClipboard(e.target.dataset.content, e.target, '✅', '📋');
            });
        });
    }

    elements.copyAllTableBtn.addEventListener('click', () => {
        if (!state.notebookData) return;
        
        let dumpText = '【NotebookLM ストックすべきデータ一覧】\n\n';
        state.notebookData.sources.forEach(s => {
            dumpText += `■ ${s.category}\n内容: ${s.content}\n形式: ${s.format}\n例: ${s.example}\n優先度: ${s.priority}\n\n`;
        });
        
        copyToClipboard(dumpText, elements.copyAllTableBtn, '✅ 全件コピー完了', '📋 全件コピー');
    });

    // ========== 共通：📎 アップロード処理 ==========
    elements.uploadTriggerBtn.addEventListener('click', () => {
        elements.fileInput.value = '';
        elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 軽いフィードバック
        addMessage('AI', `📎 「${file.name}」を受け取りました。内容を解析しています…`);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                addMessage('AI', '資料の解析中にエラーが発生しました。');
                return;
            }

            const data = await response.json();
            const { extractedText, notebookData } = data;

            // C案：全文は内部保持、チャットには要約だけ
            state.uploadedDocs.push({
                name: file.name,
                fullText: extractedText,
                notebookData
            });

            // NotebookLM用データとしても保持（STEP4で使う）
            if (notebookData) {
                state.notebookData = notebookData;
            }

            // チャットには要約だけ表示（NotebookLM側の summary を利用）
            const summaryText = notebookData && notebookData.summary
                ? notebookData.summary
                : '資料の内容を解析しました。（要約テキストが取得できませんでした）';

            addMessage(
                'user',
                `資料「${file.name}」をアップロードしました。\n要約：\n${summaryText}`
            );

        } catch (error) {
            console.error('Upload Error:', error);
            addMessage('AI', '資料のアップロード中にエラーが発生しました。');
        }
    });
});
