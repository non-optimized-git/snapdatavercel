    // ================== 核心变量 ==================
    let rawData = null, headers = [], taskCount = 0, tableStates = {};
    let filteredData = null;
    let filters = [];
    let columnUniqueValues = {};
    let crossDiffSettings = {};
    let mainAnalysisData = {};
    
    // ================== Z检验函数 ==================
    function calculateZTest(p1, n1, p2, n2) {
        if (n1 === 0 || n2 === 0) return 0;
        
        const p1_dec = p1 / 100;
        const p2_dec = p2 / 100;
        
        const p_pool = (p1_dec * n1 + p2_dec * n2) / (n1 + n2);
        const se = Math.sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2));
        
        if (se === 0) return 0;
        
        const z = (p1_dec - p2_dec) / se;
        
        return z;
    }
    
    // ================== 智能结论生成函数 ==================
    function generateSmartConclusion(bulbHighlights, mainOptions, crossValues, displayMode, crossColBaseValues, crossData, mainTotalValues) {
        if (!bulbHighlights || bulbHighlights.length === 0) {
            return {
                content: "未发现显著高的数据点。",
                stats: {
                    totalHighlights: 0,
                    uniqueOptions: 0,
                    uniqueCrossValues: 0
                }
            };
        }
        
        // 按交叉列的值分组高亮点
        const highlightsByCrossValue = {};
        const usedMainOptions = new Set();
        
        bulbHighlights.forEach(highlight => {
            const crossValue = crossValues[highlight.colIndex];
            const option = mainOptions[highlight.rowIndex - 1];
            
            if (!highlightsByCrossValue[crossValue]) {
                highlightsByCrossValue[crossValue] = [];
            }
            
            highlightsByCrossValue[crossValue].push({
                option: option,
                value: highlight.value,
                displayMode: displayMode,
                count: highlight.count,
                base: highlight.base,
                totalValue: mainTotalValues[option] || 0
            });
            
            usedMainOptions.add(option);
        });
        
        // 构建自然语言结论
        const conclusionLines = [];
        
        const sortedCrossValues = [...crossValues];
        
        sortedCrossValues.forEach(crossVal => {
            const highlights = highlightsByCrossValue[crossVal];
            if (highlights && highlights.length > 0) {
                // 处理选项：去掉括号内容
                const processedHighlights = highlights.map(h => {
                    let optionName = String(h.option || '');
                    optionName = optionName.replace(/\([^)]*\)/g, '').trim();
                    if (!optionName) optionName = h.option;
                    
                    return {
                        ...h,
                        processedOption: optionName
                    };
                });
                
                // 去重
                const uniqueHighlights = [];
                const seenOptions = new Set();
                
                processedHighlights.forEach(h => {
                    if (!seenOptions.has(h.processedOption)) {
                        seenOptions.add(h.processedOption);
                        uniqueHighlights.push(h);
                    }
                });
                
                // 生成该交叉列的结论行
                const highlightTexts = uniqueHighlights.map(h => {
                    // 第二个数使用total列的数值
                    let secondValue = h.totalValue;
                    
                    if (displayMode === 'percent') {
                        const currentValue = h.value.toFixed(1);
                        const compValue = secondValue.toFixed(1);
                        return `${escapeHtml(h.processedOption)}（${currentValue}% / ${compValue}%）`;
                    } else {
                        const currentValue = h.value;
                        const compValue = secondValue;
                        return `${escapeHtml(h.processedOption)}（${currentValue} / ${compValue}）`;
                    }
                });
                
                if (highlightTexts.length > 0) {
                    conclusionLines.push(`- <span class="conclusion-column">${escapeHtml(crossVal)}</span> 在 ${highlightTexts.join('、')} 显著较高`);
                }
            }
        });
        
        // 构建结论HTML
        let conclusionHTML = '';
        if (conclusionLines.length > 0) {
            conclusionHTML = conclusionLines.join('<br>');
        } else {
            conclusionHTML = "未发现显著高的数据点。";
        }
        
        return {
            content: conclusionHTML,
            stats: {
                totalHighlights: bulbHighlights.length,
                uniqueOptions: usedMainOptions.size,
                uniqueCrossValues: Object.keys(highlightsByCrossValue).length
            }
        };
    }
    
    // ================== 工具函数 ==================
    function updateOnlineStatus() {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const offlineIndicator = document.getElementById('offlineIndicator');
        
        if (navigator.onLine) {
            statusDot.className = 'status-dot';
            statusText.textContent = '在线';
            offlineIndicator.style.display = 'none';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = '离线';
            offlineIndicator.style.display = 'block';
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    function showConfirm(title, desc) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('custom-modal-overlay');
            document.getElementById('modal-title').innerText = title;
            document.getElementById('modal-desc').innerText = desc;
            overlay.style.display = 'flex';
            
            const cleanUp = (res) => {
                overlay.style.display = 'none';
                document.getElementById('modal-confirm').onclick = null;
                document.getElementById('modal-cancel').onclick = null;
                resolve(res);
            };
            
            document.getElementById('modal-confirm').onclick = () => cleanUp(true);
            document.getElementById('modal-cancel').onclick = () => cleanUp(false);
        });
    }
    
    function showFilenameDialog(defaultName) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('custom-modal-overlay');
            document.getElementById('modal-title').innerText = "输入文件名";
            document.getElementById('modal-desc').innerHTML = `
                <input type="text" id="filename-input" value="${defaultName}" style="width:100%; padding:8px; border:1px solid var(--muji-border); border-radius:4px; font-size:13px;" autocomplete="off">
            `;
            overlay.style.display = 'flex';
            
            const cleanUp = (res) => {
                overlay.style.display = 'none';
                document.getElementById('modal-confirm').onclick = null;
                document.getElementById('modal-cancel').onclick = null;
                resolve(res);
            };
            
            document.getElementById('modal-confirm').onclick = () => {
                const input = document.getElementById('filename-input');
                let filename = input.value.trim();
                if (!filename) filename = defaultName;
                if (!filename.toLowerCase().endsWith('.xlsx')) {
                    filename += '.xlsx';
                }
                cleanUp(filename);
            };
            document.getElementById('modal-cancel').onclick = () => cleanUp(null);
            
            setTimeout(() => {
                const input = document.getElementById('filename-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);
        });
    }
    
    function simplifyColumnName(colName) {
        if (!colName) return "";
        
        const punctuation = ['，', '。', '、', '；', '：', '？', '！', '（', '）', '《', '》'];
        for (let punc of punctuation) {
            const index = colName.indexOf(punc);
            if (index > 0) {
                return colName.substring(0, index);
            }
        }
        
        const engPunctuation = [',', '.', ';', ':', '?', '!', '(', ')', '[', ']', '{', '}'];
        for (let punc of engPunctuation) {
            const index = colName.indexOf(punc);
            if (index > 0) {
                return colName.substring(0, index);
            }
        }
        
        if (colName.length > 8) {
            return colName.substring(0, 6) + '...';
        }
        
        return colName;
    }
    
    const icons = {
        up: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
        down: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
        left: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
        right: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
        close: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
        bulb: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4M9 14h6"/></svg>`,
        diff: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 13v-8M16 21v-8M12 17v-8M4 21v-8"/><line x1="4" y1="13" x2="8" y2="13"/><line x1="12" y1="9" x2="16" y2="9"/><line x1="4" y1="5" x2="20" y2="5"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`
    };
    
    // ================== 数据处理函数 ==================
    function getColumnUniqueValues(columnName) {
        if (!rawData || !columnName) return [];
        
        if (columnUniqueValues[columnName]) {
            return columnUniqueValues[columnName];
        }
        
        const valuesSet = new Set();
        // 使用完整数据
        for (let i = 0; i < rawData.length; i++) {
            const value = rawData[i][columnName];
            if (value !== undefined && value !== null && value !== '') {
                if (typeof value === 'string' && value.includes(',')) {
                    const parts = value.split(',').map(v => v.trim()).filter(v => v);
                    parts.forEach(part => valuesSet.add(part));
                } else {
                    valuesSet.add(String(value));
                }
            }
        }
        
        let values = Array.from(valuesSet);
        
        const numericValues = values.filter(v => !isNaN(parseFloat(v)) && isFinite(v));
        const nonNumericValues = values.filter(v => isNaN(parseFloat(v)) || !isFinite(v));
        
        if (numericValues.length > 0) {
            numericValues.sort((a, b) => parseFloat(a) - parseFloat(b));
            values = [...numericValues, ...nonNumericValues.sort()];
        } else {
            values.sort();
        }
        
        values = values.slice(0, 50); // 限制返回数量
        
        columnUniqueValues[columnName] = values;
        return values;
    }
    
    function isNumericColumn(columnName) {
        if (!rawData || !columnName) return false;
        
        const sampleSize = Math.min(15, rawData.length);
        let numericCount = 0;
        let totalCount = 0;
        
        for (let i = 0; i < sampleSize; i++) {
            const value = rawData[i][columnName];
            if (value !== undefined && value !== null && value !== '') {
                totalCount++;
                const num = parseFloat(value);
                if (!isNaN(num) && isFinite(num)) {
                    numericCount++;
                }
            }
        }
        
        return totalCount > 0 && (numericCount / totalCount) > 0.8;
    }
    
    function isPureNumber(value) {
        if (value === undefined || value === null || value === '') return false;
        const strValue = String(value).trim();
        return /^-?\d*\.?\d+$/.test(strValue);
    }
    
    function checkIfOptionsArePureNumbers(options) {
        if (!options || options.length === 0) return false;
        
        const checkLimit = Math.min(5, options.length);
        for (let i = 0; i < checkLimit; i++) {
            if (options[i] && !isPureNumber(options[i])) {
                return false;
            }
        }
        return true;
    }
    
    function calculateWeightedMean(options, frequencies, base) {
        if (!options || !frequencies || options.length !== frequencies.length || base <= 0) {
            return 0;
        }
        
        let sumProduct = 0;
        for (let i = 0; i < options.length; i++) {
            const optionNum = parseFloat(options[i]);
            const freq = frequencies[i];
            sumProduct += optionNum * freq;
        }
        
        return parseFloat((sumProduct / base).toFixed(2));
    }
    
    function getCurrentData() {
        return filteredData || rawData;
    }
    
    // ================== 灯泡高亮函数（Z检验）- 85%置信水平 ==================
    function calculateBulbHighlightsByZTest(rows, crossValues, displayMode, prec, crossColBaseValues, crossData) {
        const highlights = [];
        const zThreshold = 1.44; // 85%置信水平
        
        // 使用所有行
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            if (row.classList.contains('mean-row')) continue;
            
            const rowOption = row.querySelector('.freeze-col')?.textContent;
            if (!rowOption) continue;
            
            const rowValues = [];
            
            for (let colIndex = 0; colIndex < crossValues.length; colIndex++) {
                const crossVal = crossValues[colIndex];
                const colTotal = crossColBaseValues[crossVal] || 0;
                const count = crossData[rowOption] ? (crossData[rowOption][crossVal] || 0) : 0;
                
                let value;
                if (displayMode === 'percent') {
                    value = colTotal > 0 ? (count / colTotal) * 100 : 0;
                } else {
                    value = count;
                }
                
                rowValues.push({
                    value: value,
                    colIndex: colIndex,
                    count: count,
                    base: colTotal
                });
            }
            
            if (rowValues.length < 2) continue;
            
            rowValues.sort((a, b) => b.value - a.value);
            const highest = rowValues[0];
            const secondHighest = rowValues[1];
            
            const zValue = calculateZTest(highest.value, highest.base, secondHighest.value, secondHighest.base);
            
            if (Math.abs(zValue) > zThreshold && highest.value > 0) {
                highlights.push({
                    rowIndex: rowIndex,
                    colIndex: highest.colIndex,
                    value: highest.value,
                    zValue: zValue,
                    count: highest.count,
                    base: highest.base
                });
            }
        }
        
        return highlights;
    }
    
    // ================== 文件上传处理 ==================
    const fileBox = document.getElementById('fileBox');
    const uploadInput = document.getElementById('upload');
    
    fileBox.addEventListener('click', () => {
        uploadInput.click();
    });
    
    fileBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileBox.classList.add('drag-over');
    });
    
    fileBox.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileBox.classList.remove('drag-over');
    });
    
    fileBox.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileBox.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.match(/\.(xlsx|xls)$/i)) {
                handleFileUpload(file);
            } else {
                alert('请上传 Excel 文件 (.xlsx 或 .xls 格式)');
            }
        }
    });
    
    uploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0]; 
        if (file) {
            handleFileUpload(file);
        }
    });
    
    function handleFileUpload(file) {
        const progressContainer = document.getElementById('progressContainer');
        const progressText = document.getElementById('progressText');
        const progressPercent = document.getElementById('progressPercent');
        const progressFill = document.getElementById('progressFill');
        
        progressContainer.style.display = 'block';
        progressText.textContent = '正在读取文件...';
        progressPercent.textContent = '0%';
        progressFill.style.width = '0%';
        
        document.getElementById('fileInfo').textContent = `${file.name} (${(file.size/1024).toFixed(1)}KB)`;
        
        const reader = new FileReader();
        
        let currentProgress = 0;
        let targetProgress = 0;
        let animationId = null;
        
        function updateProgress() {
            if (currentProgress < targetProgress) {
                currentProgress += 0.5;
                if (currentProgress > targetProgress) {
                    currentProgress = targetProgress;
                }
                
                progressPercent.textContent = Math.floor(currentProgress) + '%';
                progressFill.style.width = currentProgress + '%';
                
                if (currentProgress < targetProgress) {
                    animationId = requestAnimationFrame(updateProgress);
                } else if (currentProgress >= 100) {
                    progressPercent.textContent = '100%';
                    progressFill.style.width = '100%';
                }
            }
        }
        
        function startProgressAnimation() {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
            animationId = requestAnimationFrame(updateProgress);
        }
        
        function setTargetProgress(target) {
            targetProgress = target;
            if (targetProgress > currentProgress) {
                startProgressAnimation();
            }
        }
        
        setTargetProgress(10);
        
        reader.onprogress = function(e) {
            if (e.lengthComputable) {
                const realProgress = 10 + Math.round((e.loaded / e.total) * 80);
                setTargetProgress(realProgress);
                
                if (realProgress < 100) {
                    progressText.textContent = '正在读取文件...';
                }
            }
        };
        
        reader.onload = function(e) {
            setTargetProgress(95);
            progressText.textContent = '正在处理数据...';
            
            // 使用setTimeout避免阻塞UI
            setTimeout(() => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, {header: 1});
                    
                    setTargetProgress(100);
                    
                    setTimeout(() => {
                        const totalCols = rows.length > 0 ? rows[0].length : 0;
                        const totalRows = rows.length - 1;
                        
                        headers = rows[0].map((h, index) => ({ 
                            text: h || `未命名列${index+1}`,
                            index: index
                        }));
                        rawData = XLSX.utils.sheet_to_json(sheet, {defval: ""});
                        filteredData = null;
                        
                        columnUniqueValues = {};
                        
                        document.getElementById('fileStats').innerHTML = 
                            `包含 <span class="red-number">${totalCols}</span> 列，<span class="red-number">${totalRows}</span> 行数据`;
                        
                        setTimeout(() => {
                            progressContainer.style.display = 'none';
                            currentProgress = 0;
                            targetProgress = 0;
                        }, 500);
                        
                        document.getElementById('workspace').style.display = 'block';
                        document.getElementById('filterSection').style.display = 'block';
                        
                        document.getElementById('taskList').innerHTML = ""; 
                        taskCount = 0;
                        
                        document.getElementById('filterConditions').innerHTML = '';
                        filters = [];
                        document.getElementById('filterStatus').textContent = '';
                        
                        mainAnalysisData = {};
                        
                        addTask();
                        
                    }, 300);
                    
                } catch (error) {
                    console.error('文件处理错误:', error);
                    alert('文件处理失败，请确保文件格式正确');
                    progressContainer.style.display = 'none';
                }
            }, 50);
        };
        
        reader.onerror = function() {
            progressContainer.style.display = 'none';
            alert('文件读取失败，请重试');
        };
        
        reader.readAsArrayBuffer(file);
    }
    
    // ================== 数据筛选功能 ==================
    function addFilterRow(column = '', operator = '=', value = '') {
        const filterId = `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const operators = [
            { value: '=', label: '等于' },
            { value: '!=', label: '不等于' },
            { value: '>', label: '大于' },
            { value: '>=', label: '大于等于' },
            { value: '<', label: '小于' },
            { value: '<=', label: '小于等于' },
            { value: 'contains', label: '包含' },
            { value: 'not_contains', label: '不包含' }
        ];
        
        let uniqueValues = [];
        let isNumeric = false;
        
        if (column) {
            const decodedColumn = decodeURIComponent(column);
            uniqueValues = getColumnUniqueValues(decodedColumn);
            isNumeric = isNumericColumn(decodedColumn);
        }
        
        const datalistId = `datalist_${filterId}`;
        const datalistHTML = uniqueValues.length > 0 ? 
            `<datalist id="${datalistId}">
                ${uniqueValues.slice(0, 20).map(v => `<option value="${v}">${v}</option>`).join('')}
            </datalist>` : '';
        
        let valueInputHTML = '';
        if (isNumeric) {
            valueInputHTML = `
                <input type="text" class="filter-value-combobox filter-value" placeholder="输入数值或选择..." value="${value}" list="${datalistId}" style="width:150px;">
                ${datalistHTML}
            `;
        } else {
            valueInputHTML = `
                <select class="filter-value-combobox filter-value" data-datalist="${datalistId}">
                    <option value="">选择或输入值...</option>
                    ${uniqueValues.slice(0, 20).map(v => `<option value="${v}" ${value === v ? 'selected' : ''}>${v}</option>`).join('')}
                    <option value="_custom_">自定义输入...</option>
                </select>
                ${datalistHTML}
            `;
        }
        
        const html = `
            <div class="filter-row" id="${filterId}">
                <select class="filter-select filter-column" onchange="updateFilterValueInput('${filterId}')">
                    <option value="">选择列...</option>
                    ${headers.map(h => `<option value="${encodeURIComponent(h.text)}" ${column === encodeURIComponent(h.text) ? 'selected' : ''}>${h.text}</option>`).join('')}
                </select>
                <select class="filter-select filter-operator">
                    ${operators.map(op => `<option value="${op.value}" ${operator === op.value ? 'selected' : ''}>${op.label}</option>`).join('')}
                </select>
                ${valueInputHTML}
                <button class="ico-round" onclick="removeFilter('${filterId}')" style="width:20px;height:20px;">
                    ${icons.close}
                </button>
            </div>`;
        
        document.getElementById('filterConditions').insertAdjacentHTML('beforeend', html);
        
        if (!isNumeric && column) {
            setTimeout(() => {
                const valueSelect = document.querySelector(`#${filterId} .filter-value`);
                if (valueSelect && valueSelect.tagName === 'SELECT') {
                    valueSelect.addEventListener('change', function() {
                        if (this.value === '_custom_') {
                            const customInput = document.createElement('input');
                            customInput.type = 'text';
                            customInput.className = 'filter-input filter-value';
                            customInput.placeholder = '输入自定义值';
                            customInput.style.minWidth = '150px';
                            customInput.style.height = '32px';
                            this.parentNode.replaceChild(customInput, this);
                        }
                    });
                }
            }, 10);
        }
    }
    
    function updateFilterValueInput(filterId) {
        const row = document.getElementById(filterId);
        if (!row) return;
        
        const columnSelect = row.querySelector('.filter-column');
        if (!columnSelect.value) return;
        
        const columnName = decodeURIComponent(columnSelect.value);
        const uniqueValues = getColumnUniqueValues(columnName);
        const isNumeric = isNumericColumn(columnName);
        const currentValue = row.querySelector('.filter-value') ? row.querySelector('.filter-value').value : '';
        
        const oldValueInput = row.querySelector('.filter-value');
        if (oldValueInput) {
            oldValueInput.remove();
        }
        
        const oldDatalist = row.querySelector('datalist');
        if (oldDatalist) {
            oldDatalist.remove();
        }
        
        const datalistId = `datalist_${filterId}`;
        const datalistHTML = uniqueValues.length > 0 ? 
            `<datalist id="${datalistId}">
                ${uniqueValues.slice(0, 20).map(v => `<option value="${v}">${v}</option>`).join('')}
            </datalist>` : '';
        
        let valueInputHTML = '';
        if (isNumeric) {
            valueInputHTML = `
                <input type="text" class="filter-value-combobox filter-value" placeholder="输入数值或选择..." value="${currentValue}" list="${datalistId}" style="width:150px;">
                ${datalistHTML}
            `;
        } else {
            valueInputHTML = `
                <select class="filter-value-combobox filter-value" data-datalist="${datalistId}">
                    <option value="">选择或输入值...</option>
                    ${uniqueValues.slice(0, 20).map(v => `<option value="${v}" ${currentValue === v ? 'selected' : ''}>${v}</option>`).join('')}
                    <option value="_custom_">自定义输入...</option>
                </select>
                ${datalistHTML}
            `;
        }
        
        const operatorSelect = row.querySelector('.filter-operator');
        operatorSelect.insertAdjacentHTML('afterend', valueInputHTML);
        
        if (!isNumeric) {
            setTimeout(() => {
                const valueSelect = row.querySelector('.filter-value');
                if (valueSelect && valueSelect.tagName === 'SELECT') {
                    valueSelect.addEventListener('change', function() {
                        if (this.value === '_custom_') {
                            const customInput = document.createElement('input');
                            customInput.type = 'text';
                            customInput.className = 'filter-input filter-value';
                            customInput.placeholder = '输入自定义值';
                            customInput.style.minWidth = '150px';
                            customInput.style.height = '32px';
                            this.parentNode.replaceChild(customInput, this);
                        }
                    });
                }
            }, 10);
        }
    }
    
    function removeFilter(filterId) {
        const element = document.getElementById(filterId);
        if (element) {
            element.remove();
        }
    }
    
    function applyFilters() {
        if (!rawData) {
            document.getElementById('filterStatus').textContent = '请先上传数据';
            return;
        }
        
        const conditions = [];
        document.querySelectorAll('.filter-row').forEach(row => {
            const columnSelect = row.querySelector('.filter-column');
            const operatorSelect = row.querySelector('.filter-operator');
            const valueInput = row.querySelector('.filter-value');
            
            if (columnSelect.value && operatorSelect.value && valueInput && valueInput.value.trim() !== '') {
                conditions.push({
                    column: decodeURIComponent(columnSelect.value),
                    operator: operatorSelect.value,
                    value: valueInput.value.trim()
                });
            }
        });
        
        filters = conditions;
        
        if (conditions.length === 0) {
            filteredData = null;
            document.getElementById('filterStatus').textContent = '已清除筛选，显示全部数据';
            updateAllAnalyses();
            return;
        }
        
        // 使用setTimeout避免UI阻塞
        setTimeout(() => {
            filteredData = rawData.filter(row => {
                return conditions.every(condition => {
                    const cellValue = row[condition.column];
                    const filterValue = condition.value;
                    
                    if (cellValue === undefined || cellValue === null || cellValue === '') {
                        return false;
                    }
                    
                    const cellStr = String(cellValue).toLowerCase();
                    const filterStr = filterValue.toLowerCase();
                    
                    switch (condition.operator) {
                        case '=':
                            return cellStr === filterStr;
                        case '!=':
                            return cellStr !== filterStr;
                        case '>':
                            return parseFloat(cellValue) > parseFloat(filterValue);
                        case '>=':
                            return parseFloat(cellValue) >= parseFloat(filterValue);
                        case '<':
                            return parseFloat(cellValue) < parseFloat(filterValue);
                        case '<=':
                            return parseFloat(cellValue) <= parseFloat(filterValue);
                        case 'contains':
                            return cellStr.includes(filterStr);
                        case 'not_contains':
                            return !cellStr.includes(filterStr);
                        default:
                            return true;
                    }
                });
            });
            
            document.getElementById('filterStatus').textContent = `筛选后数据: ${filteredData.length} 行 (原数据: ${rawData.length} 行)`;
            updateAllAnalyses();
        }, 0);
    }
    
    function clearFilters() {
        document.getElementById('filterConditions').innerHTML = '';
        filters = [];
        filteredData = null;
        document.getElementById('filterStatus').textContent = '筛选已清除';
        updateAllAnalyses();
    }
    
    function updateAllAnalyses() {
        const taskBlocks = document.querySelectorAll('.task-block');
        // 使用requestAnimationFrame分批更新，避免阻塞UI
        let index = 0;
        function updateNext() {
            if (index < taskBlocks.length) {
                const block = taskBlocks[index];
                const taskId = block.id;
                const selectEl = block.querySelector('.col-sel');
                if (selectEl && selectEl.value) {
                    renderAnalysis(taskId);
                }
                index++;
                requestAnimationFrame(updateNext);
            }
        }
        requestAnimationFrame(updateNext);
    }
    
    // ================== 分析题目管理 ==================
    function renumberTasks() {
        const taskBlocks = document.querySelectorAll('.task-block');
        
        taskBlocks.forEach((block, index) => {
            const newNumber = index + 1;
            const titleElement = block.querySelector('.section-title');
            if (titleElement) {
                titleElement.textContent = `分析题目 ${newNumber}`;
            }
        });
    }
    
    function addTask() {
        taskCount++; 
        const id = `task_${taskCount}`;
        tableStates[id] = { 
            prec: 0,
            sort: 'desc',
            displayMode: 'percent',
            simplifiedColName: ''
        };
        
        const html = `
            <div class="task-block" id="${id}">
                <button class="ico-round remove-btn" onclick="removeTask('${id}')" title="移除题目">
                    ${icons.close}
                </button>
                <div class="analysis-title">分析题目</div>
                <select class="custom-select col-sel" onchange="renderAnalysis('${id}')">
                    <option value="">选择分析列...</option>
                    ${headers.map(h => `<option value="${encodeURIComponent(h.text)}">${escapeHtml(h.text)}</option>`).join('')}
                </select>
                <div id="cont_${id}"></div>
                <div id="cross_area_${id}"></div>
                <div style="display:flex; justify-content:space-between; margin-top:30px; border-top:1px solid var(--muji-border); padding-top:20px;">
                    <button class="cross-analysis-btn" onclick="addCross('${id}')" style="height:32px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="plus-icon">
                            <path d="M12 5v14M5 12h14"/>
                        </svg>
                        交叉分析
                    </button>
                </div>
            </div>`;
        
        document.getElementById('taskList').insertAdjacentHTML('beforeend', html);
        
        setTimeout(() => {
            const element = document.getElementById(id);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 50);
    }
    
    async function removeTask(id) {
        if (await showConfirm("确认移除", "确定要移除此分析题目吗？")) {
            const element = document.getElementById(id);
            if (element) {
                element.classList.add('removing');
                setTimeout(() => {
                    element.remove();
                    delete tableStates[id];
                    delete mainAnalysisData[id];
                    renumberTasks();
                }, 300);
            }
        }
    }
    
    async function closeCross(id) {
        if (await showConfirm("确认移除", "确定要移除此交叉分析吗？")) {
            const element = document.getElementById(id);
            if (element) {
                element.remove();
                delete crossDiffSettings[id];
            }
        }
    }
    
    // ================== 主分析渲染 ==================
    function renderAnalysis(id, sortType) {
        const col = decodeURIComponent(document.querySelector(`#${id} .col-sel`).value);
        if (!col) {
            document.getElementById(`cont_${id}`).innerHTML = '<div class="empty-state">请选择分析列</div>';
            return;
        }
        
        if(sortType) tableStates[id].sort = sortType;
        
        tableStates[id].simplifiedColName = simplifyColumnName(col);
        
        const currentData = getCurrentData();
        if (!currentData) {
            document.getElementById(`cont_${id}`).innerHTML = '<div class="empty-state">没有可用数据</div>';
            return;
        }
        
        // 使用requestAnimationFrame避免阻塞UI
        requestAnimationFrame(() => {
            let map = {}, total = 0;
            // 使用完整数据
            currentData.forEach(r => { 
                if (r[col]) { 
                    total++; 
                    [...new Set(String(r[col]).split(',').map(s => s.trim()).filter(Boolean))]
                        .forEach(t => map[t] = (map[t] || 0) + 1); 
                }
            });
            
            let list = Object.keys(map).map(k => ({ 
                name: k, 
                count: map[k], 
                p: (map[k] / total * 100) 
            }));
            
            if (tableStates[id].sort === 'desc') {
                list.sort((a,b) => b.count - a.count); 
            } else {
                list.sort((a,b) => a.count - b.count);
            }
            
            // 限制显示数量
            if (list.length > 50) {
                list = list.slice(0, 50);
            }
            
            mainAnalysisData[id] = {
                options: list.map(item => item.name),
                counts: list.map(item => item.count),
                percentages: list.map(item => item.p),
                total: total
            };
            
            const prec = tableStates[id].prec;
            const displayMode = tableStates[id].displayMode;
            
            const maxValue = displayMode === 'percent' ? 
                Math.max(...list.map(item => item.p), 100) : 
                Math.max(...list.map(item => item.count), total);
            
            const options = list.map(item => item.name);
            const isPureNumbers = checkIfOptionsArePureNumbers(options);
            
            let meanValue = null;
            if (isPureNumbers) {
                const frequencies = list.map(item => item.count);
                meanValue = calculateWeightedMean(options, frequencies, total);
            }
            
            const html = `
                <div class="header-controls">
                    <div></div>
                    <div class="header-right-container">
                        <button class="btn-base copy-header-btn btn-copy" onclick="copyTable('table_${id}', this)" title="复制表格">
                            <span class="copy-text">复制</span>
                        </button>
                        <div class="display-toggle">
                            <button class="toggle-btn ${displayMode === 'percent' ? 'active' : ''}" onclick="toggleDisplayMode('${id}', 'percent')">百分比</button>
                            <button class="toggle-btn ${displayMode === 'count' ? 'active' : ''}" onclick="toggleDisplayMode('${id}', 'count')">频数</button>
                        </div>
                    </div>
                </div>
                <div class="table-container">
                    <table id="table_${id}">
                        <thead>
                            <tr>
                                <th style="width:30px"></th>
                                <th class="col-name"></th>
                                <th>
                                    Total
                                    <div class="header-icons">
                                        <div class="ico-round" onclick="renderAnalysis('${id}','asc')" title="升序">${icons.up}</div>
                                        <div class="ico-round" onclick="renderAnalysis('${id}','desc')" title="降序">${icons.down}</div>
                                        <div class="ico-round" onclick="adjustPrecision('${id}', -1)" title="减少小数位数">${icons.left}</div>
                                        <div class="ico-round" onclick="adjustPrecision('${id}', 1)" title="增加小数位数">${icons.right}</div>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody id="tbody_${id}">
                            <tr style="color:var(--gray-text); font-style: italic;">
                                <td class="col-sort">-</td>
                                <td class="col-name">Base (n)</td>
                                <td class="base-cell">
                                    <span class="value">${total}</span>
                                </td>
                            </tr>
                            ${list.map((i, index) => {
                                const value = displayMode === 'percent' ? i.p.toFixed(prec) + '%' : i.count;
                                const barPercent = displayMode === 'percent' ? (i.p / maxValue * 100) : (i.count / maxValue * 100);
                                
                                return `
                                    <tr class="drag-row" data-id="${encodeURIComponent(i.name)}">
                                        <td style="cursor:move;color:var(--status-muted); user-select:none;" title="拖动排序">☰</td>
                                        <td class="col-name">${escapeHtml(i.name)}</td>
                                        <td class="bar-cell" style="--bar-percent: ${barPercent}%">
                                            <span class="value">${value}</span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                            ${isPureNumbers && meanValue !== null ? `
                                <tr class="mean-row">
                                    <td></td>
                                    <td class="col-name">mean</td>
                                    <td class="base-cell">
                                        <span class="value">${meanValue.toFixed(2)}</span>
                                    </td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>`;
            
            document.getElementById(`cont_${id}`).innerHTML = html;
            
            // 延迟初始化Sortable，避免阻塞
            setTimeout(() => {
                const tbody = document.getElementById(`tbody_${id}`);
                if (tbody) {
                    new Sortable(tbody, { 
                        animation: 150,
                        handle: 'td:first-child',
                        filter: 'tr:first-child',
                        onEnd: function() {
                            const newOptions = [];
                            const rows = document.querySelectorAll(`#tbody_${id} .drag-row`);
                            rows.forEach(row => {
                                newOptions.push(decodeURIComponent(row.dataset.id));
                            });
                            
                            const originalData = mainAnalysisData[id];
                            if (originalData) {
                                const newCounts = [];
                                const newPercentages = [];
                                
                                newOptions.forEach(opt => {
                                    const index = originalData.options.indexOf(opt);
                                    if (index !== -1) {
                                        newCounts.push(originalData.counts[index]);
                                        newPercentages.push(originalData.percentages[index]);
                                    }
                                });
                                
                                mainAnalysisData[id] = {
                                    options: newOptions,
                                    counts: newCounts,
                                    percentages: newPercentages,
                                    total: originalData.total
                                };
                            }
                            
                            updateCrossAnalysis(id);
                        }
                    });
                }
            }, 100);
            
            updateCrossAnalysis(id);
        });
    }
    
    function toggleDisplayMode(taskId, mode) {
        if (tableStates[taskId].displayMode === mode) return;
        tableStates[taskId].displayMode = mode;
        renderAnalysis(taskId);
    }
    
    function adjustPrecision(taskId, delta) {
        let newPrec = tableStates[taskId].prec + delta;
        if (newPrec >= 0 && newPrec <= 4) {
            tableStates[taskId].prec = newPrec;
            renderAnalysis(taskId);
        }
    }
    
    // ================== 交叉分析 ==================
    function addCross(taskId) {
        const crossId = `cross_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (!crossDiffSettings[crossId]) {
            crossDiffSettings[crossId] = {
                enabled: false,
                topN: 1,
                bulbEnabled: false,
                bulbMethod: 'ztest'
            };
        }
        
        document.getElementById(`cross_area_${taskId}`).insertAdjacentHTML('beforeend', `
            <div class="cross-sub-block" id="${crossId}" data-task="${taskId}">
                <button class="ico-round remove-btn" onclick="closeCross('${crossId}')" title="移除交叉分析" style="top:10px;right:10px;">
                    ${icons.close}
                </button>
                <div style="margin-bottom:15px;">
                    <span style="font-size:12px; font-weight:600; color:var(--muji-red);">交叉分析</span>
                </div>
                <select class="custom-select" onchange="renderCross('${taskId}', '${crossId}')" style="margin-bottom:15px;">
                    <option value="">选择交叉列...</option>
                    ${headers.map(h => `<option value="${encodeURIComponent(h.text)}">${h.text}</option>`).join('')}
                </select>
                <div id="cont_${crossId}"></div>
            </div>`);
    }
    
    function renderCross(taskId, crossId) {
        const mainCol = decodeURIComponent(document.querySelector(`#${taskId} .col-sel`).value);
        const crossCol = decodeURIComponent(document.querySelector(`#${crossId} select`).value);
        
        if (!mainCol || !crossCol) {
            document.getElementById(`cont_${crossId}`).innerHTML = '<div class="empty-state">请选择交叉列</div>';
            return;
        }
        
        const mainData = mainAnalysisData[taskId];
        if (!mainData) {
            document.getElementById(`cont_${crossId}`).innerHTML = '<div class="empty-state">请先完成主分析</div>';
            return;
        }
        
        // 使用setTimeout避免阻塞UI
        setTimeout(() => {
            const mainOptions = mainData.options;
            const mainCounts = mainData.counts;
            const mainPercentages = mainData.percentages;
            const grandTotal = mainData.total;
            
            const isMainOptionsPureNumbers = checkIfOptionsArePureNumbers(mainOptions);
            
            const currentData = getCurrentData();
            if (!currentData) {
                document.getElementById(`cont_${crossId}`).innerHTML = '<div class="empty-state">没有可用数据</div>';
                return;
            }
            
            const crossValuesSet = new Set();
            // 使用完整数据
            currentData.forEach(row => {
                if (row[crossCol]) {
                    const values = String(row[crossCol]).split(',').map(s => s.trim()).filter(Boolean);
                    values.forEach(v => crossValuesSet.add(v));
                }
            });
            const crossValues = Array.from(crossValuesSet); // 不限制交叉列数量
            
            const crossData = {};
            const crossColBaseValues = {};
            
            mainOptions.forEach(opt => { // 使用所有主选项
                crossData[opt] = {};
                crossValues.forEach(crossVal => {
                    crossData[opt][crossVal] = 0;
                });
            });
            
            crossValues.forEach(crossVal => {
                crossColBaseValues[crossVal] = 0;
            });
            
            currentData.forEach(row => {
                const mainVals = row[mainCol] ? String(row[mainCol]).split(',').map(s => s.trim()).filter(Boolean) : [];
                const crossVals = row[crossCol] ? String(row[crossCol]).split(',').map(s => s.trim()).filter(Boolean) : [];
                const uniqueCrossVals = [...new Set(crossVals)];
                
                mainVals.forEach(mainVal => {
                    if (crossData[mainVal]) {
                        uniqueCrossVals.forEach(crossVal => {
                            if (crossData[mainVal][crossVal] !== undefined) {
                                crossData[mainVal][crossVal]++;
                            }
                        });
                    }
                });

                if (mainVals.length > 0) {
                    uniqueCrossVals.forEach(crossVal => {
                        if (crossColBaseValues[crossVal] !== undefined) {
                            crossColBaseValues[crossVal]++;
                        }
                    });
                }
            });
            
            const displayMode = tableStates[taskId].displayMode;
            const prec = tableStates[taskId].prec;
            
            let maxValue = 0;
            if (displayMode === 'percent') {
                crossValues.forEach(crossVal => {
                    const colTotal = crossColBaseValues[crossVal] || 0;
                    if (colTotal > 0) {
                        mainOptions.forEach(opt => {
                            const count = crossData[opt] ? (crossData[opt][crossVal] || 0) : 0;
                            const colPercent = (count / colTotal) * 100;
                            maxValue = Math.max(maxValue, colPercent);
                        });
                    }
                });
                maxValue = Math.max(maxValue, 100);
            } else {
                mainOptions.forEach(opt => {
                    crossValues.forEach(crossVal => {
                        const count = crossData[opt] ? (crossData[opt][crossVal] || 0) : 0;
                        maxValue = Math.max(maxValue, count);
                    });
                });
                maxValue = Math.max(maxValue, ...Object.values(crossColBaseValues));
            }
            
            const diffSetting = crossDiffSettings[crossId] || { 
                enabled: false, 
                topN: 0,
                bulbEnabled: false,
                bulbMethod: 'ztest'
            };
            
            let highValueIndices = {};
            if (diffSetting.enabled && diffSetting.topN > 0) {
                mainOptions.forEach((opt, rowIndex) => {
                    const rowValues = crossValues.map((crossVal, colIndex) => {
                        const count = crossData[opt] ? (crossData[opt][crossVal] || 0) : 0;
                        const colTotal = crossColBaseValues[crossVal] || 0;
                        return displayMode === 'percent' ? 
                            (colTotal > 0 ? (count / colTotal * 100) : 0) : 
                            count;
                    });
                    
                    const indices = rowValues.map((_, idx) => idx);
                    indices.sort((a, b) => rowValues[b] - rowValues[a]);
                    highValueIndices[rowIndex] = indices.slice(0, diffSetting.topN).filter(idx => idx >= 0);
                });
            }
            
            const meanValues = {};
            if (isMainOptionsPureNumbers) {
                crossValues.forEach(crossVal => {
                    const frequencies = mainOptions.map(opt => 
                        crossData[opt] ? (crossData[opt][crossVal] || 0) : 0);
                    const base = crossColBaseValues[crossVal] || 0;
                    const numericOptions = mainOptions.map(opt => parseFloat(opt));
                    meanValues[crossVal] = calculateWeightedMean(numericOptions, frequencies, base);
                });
            }
            
            // 创建主选项的total值映射
            const mainTotalValues = {};
            mainOptions.forEach((opt, index) => {
                if (displayMode === 'percent') {
                    mainTotalValues[opt] = mainPercentages[index] || 0;
                } else {
                    mainTotalValues[opt] = mainCounts[index] || 0;
                }
            });
            
            let html = `
                <div class="header-controls">
                    <div></div>
                    <div class="header-right-container">
                        <div class="diff-btn-container">
                            <div class="diff-options" ${!diffSetting.enabled ? 'style="display:none;"' : ''}>
                                <button class="diff-option ${diffSetting.topN === 1 ? 'active' : ''}" onclick="setCrossDiffTopN('${crossId}', 1)">1</button>
                                <button class="diff-option ${diffSetting.topN === 2 ? 'active' : ''}" onclick="setCrossDiffTopN('${crossId}', 2)">2</button>
                                <button class="diff-option ${diffSetting.topN === 3 ? 'active' : ''}" onclick="setCrossDiffTopN('${crossId}', 3)">3</button>
                                <button class="bulb-btn ${diffSetting.bulbEnabled ? 'active' : ''}" onclick="toggleBulbDiff('${crossId}')" title="标记显著差异">
                                    ${icons.bulb}
                                </button>
                            </div>
                            <button class="diff-toggle ${diffSetting.enabled ? 'active' : ''}" onclick="toggleCrossDiff('${crossId}', ${!diffSetting.enabled})" title="标记高值">
                                ${icons.diff}
                                <span>差异</span>
                            </button>
                        </div>
                        <button class="btn-base btn-copy" onclick="copyTable('table_${crossId}', this)" title="复制表格">
                            <span class="copy-text">复制</span>
                        </button>
                    </div>
                </div>
                <div class="table-container">
                    <table id="table_${crossId}" class="cross-table">
                        <thead>
                            <tr>
                                <th class="freeze-col" style="width: 120px;"></th>
                                <th class="freeze-col-2" style="width: 80px;">Total</th>
                                ${crossValues.map(v => `<th>${escapeHtml(simplifyColumnName(v))}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody id="tbody_${crossId}">
                            <tr style="color:var(--gray-text); font-style: italic;">
                                <td class="freeze-col">Base (n)</td>
                                <td class="freeze-col-2">${grandTotal}</td>
                                ${crossValues.map(crossVal => {
                                    const baseValue = crossColBaseValues[crossVal] || 0;
                                    return `<td class="base-cell">
                                        <span class="value">${baseValue}</span>
                                    </td>`;
                                }).join('')}
                            </tr>`;
            
            mainOptions.forEach((opt, rowIndex) => {
                let totalValue;
                if (displayMode === 'percent') {
                    const percentage = rowIndex < mainPercentages.length ? mainPercentages[rowIndex] || 0 : 0;
                    totalValue = percentage.toFixed(prec) + '%';
                } else {
                    totalValue = rowIndex < mainCounts.length ? mainCounts[rowIndex] || 0 : 0;
                }
                
                html += `<tr>
                    <td class="freeze-col">${escapeHtml(opt)}</td>
                    <td class="freeze-col-2">${totalValue}</td>`;
                
                crossValues.forEach((crossVal, colIndex) => {
                    const count = crossData[opt] ? (crossData[opt][crossVal] || 0) : 0;
                    const colTotal = crossColBaseValues[crossVal] || 0;
                    
                    let value, barPercent;
                    
                    if (displayMode === 'percent') {
                        const colPercent = colTotal > 0 ? (count / colTotal) * 100 : 0;
                        value = colPercent.toFixed(prec) + '%';
                        barPercent = (colPercent / maxValue * 100);
                    } else {
                        value = count;
                        barPercent = (count / maxValue * 100);
                    }
                    
                    const isHighlighted = diffSetting.enabled && 
                                        highValueIndices[rowIndex] && 
                                        highValueIndices[rowIndex].includes(colIndex);
                    
                    const highlightClass = isHighlighted ? 'highlight-value' : '';
                    
                    html += `<td class="bar-cell ${highlightClass}" style="--bar-percent: ${barPercent}%">
                        <span class="value">${value}</span>
                    </td>`;
                });
                
                html += `</tr>`;
            });
            
            if (isMainOptionsPureNumbers) {
                const totalFrequencies = mainCounts;
                const totalBase = grandTotal;
                const numericOptions = mainOptions.map(opt => parseFloat(opt));
                const totalMean = calculateWeightedMean(numericOptions, totalFrequencies, totalBase);
                
                html += `<tr class="mean-row">
                    <td class="freeze-col">mean</td>
                    <td class="freeze-col-2">${totalMean.toFixed(2)}</td>`;
                
                crossValues.forEach(crossVal => {
                    const meanValue = meanValues[crossVal] || 0;
                    html += `<td class="base-cell">
                        <span class="value">${meanValue.toFixed(2)}</span>
                    </td>`;
                });
                
                html += `</tr>`;
            }
            
            html += `</tbody></table></div>`;
            
            // 添加智能结论模块占位符
            html += `
                <div class="smart-conclusion" id="smart_conclusion_${crossId}" style="display:none;">
                    <div class="conclusion-header">
                        <div class="conclusion-title">智能结论</div>
                        <div class="conclusion-actions">
                            <button class="conclusion-btn" onclick="copySmartConclusion('${crossId}')">
                                <span class="copy-text">复制</span>
                            </button>
                        </div>
                    </div>
                    <div class="conclusion-content" id="conclusion_content_${crossId}"></div>
                    <div class="conclusion-stats" id="conclusion_stats_${crossId}"></div>
                </div>`;
            
            document.getElementById(`cont_${crossId}`).innerHTML = html;
            
            // 灯泡高亮逻辑（Z检验）- 85%置信水平
            if (diffSetting.bulbEnabled) {
                setTimeout(() => {
                    const table = document.getElementById(`table_${crossId}`);
                    if (table) {
                        const rows = table.querySelectorAll('tbody tr');
                        
                        // 使用Z检验计算显著差异
                        const bulbHighlights = calculateBulbHighlightsByZTest(
                            rows, 
                            crossValues, 
                            displayMode, 
                            prec, 
                            crossColBaseValues, 
                            crossData
                        );
                        
                        // 应用灯泡标记
                        bulbHighlights.forEach(highlight => {
                            const actualRowIndex = highlight.rowIndex;
                            const actualColIndex = highlight.colIndex + 2;
                            
                            const targetRow = rows[actualRowIndex];
                            if (targetRow && targetRow.cells[actualColIndex]) {
                                const cell = targetRow.cells[actualColIndex];
                                cell.classList.add('bulb-highlight');
                            }
                        });
                        
                        // 生成并显示智能结论
                        if (bulbHighlights.length > 0) {
                            const conclusion = generateSmartConclusion(
                                bulbHighlights,
                                mainOptions,
                                crossValues,
                                displayMode,
                                crossColBaseValues,
                                crossData,
                                mainTotalValues
                            );
                            
                            const conclusionContainer = document.getElementById(`smart_conclusion_${crossId}`);
                            const conclusionContent = document.getElementById(`conclusion_content_${crossId}`);
                            const conclusionStats = document.getElementById(`conclusion_stats_${crossId}`);
                            
                            conclusionContent.innerHTML = conclusion.content;
                            conclusionStats.innerHTML = `基于Z检验分析 (85%置信水平)，共发现 <span class="red-number">${conclusion.stats.totalHighlights}</span> 个显著高的数据点，涉及 <span class="red-number">${conclusion.stats.uniqueOptions}</span> 个选项和 <span class="red-number">${conclusion.stats.uniqueCrossValues}</span> 个交叉列值。`;
                            
                            conclusionContainer.style.display = 'block';
                        } else {
                            const conclusionContainer = document.getElementById(`smart_conclusion_${crossId}`);
                            const conclusionContent = document.getElementById(`conclusion_content_${crossId}`);
                            const conclusionStats = document.getElementById(`conclusion_stats_${crossId}`);
                            
                            conclusionContent.innerHTML = "未发现显著高的数据点。";
                            conclusionStats.innerHTML = "基于Z检验分析 (85%置信水平)，未发现显著高的数据点。";
                            
                            conclusionContainer.style.display = 'block';
                        }
                    }
                }, 10);
            } else {
                // 如果未启用灯泡高亮，隐藏智能结论模块
                const conclusionContainer = document.getElementById(`smart_conclusion_${crossId}`);
                if (conclusionContainer) {
                    conclusionContainer.style.display = 'none';
                }
            }
        }, 0);
    }
    
    // 复制智能结论函数 - 修改版
    function copySmartConclusion(crossId) {
        const conclusionContent = document.getElementById(`conclusion_content_${crossId}`);
        
        if (!conclusionContent) return;
        
        // 获取纯文本内容，去掉每一行前面的"- "和Z检验行
        let contentText = conclusionContent.innerText;
        
        // 1. 去掉每一行前面的"- "
        contentText = contentText.replace(/^- /gm, '');
        
        // 2. 去掉Z检验行（如果有）
        const lines = contentText.split('\n').filter(line => {
            return !line.includes('基于Z检验分析') && 
                   !line.includes('Z检验') &&
                   !line.includes('85%置信水平');
        });
        
        contentText = lines.join('\n');
        
        navigator.clipboard.writeText(contentText).then(() => {
            // 显示复制成功提示，使用与其他复制按钮相同的样式
            const copyBtn = document.querySelector(`#smart_conclusion_${crossId} .conclusion-btn`);
            if (copyBtn) {
                const originalText = copyBtn.querySelector('.copy-text')?.textContent || copyBtn.textContent;
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                }, 800);
            }
        }).catch(err => {
            console.error('复制失败: ', err);
            alert('复制失败，请手动选择文本复制');
        });
    }
    
    function toggleCrossDiff(crossId, enabled) {
        if (!crossDiffSettings[crossId]) {
            crossDiffSettings[crossId] = {
                enabled: enabled,
                topN: enabled ? 1 : 0,
                bulbEnabled: false,
                bulbMethod: 'ztest'
            };
        } else {
            if (enabled) {
                crossDiffSettings[crossId].enabled = true;
                crossDiffSettings[crossId].bulbEnabled = false;
                if (crossDiffSettings[crossId].topN === 0) {
                    crossDiffSettings[crossId].topN = 1;
                }
            } else {
                crossDiffSettings[crossId].enabled = false;
                crossDiffSettings[crossId].bulbEnabled = false;
                crossDiffSettings[crossId].topN = 0;
            }
        }
        
        const taskId = document.getElementById(crossId).getAttribute('data-task');
        renderCross(taskId, crossId);
    }
    
    function toggleBulbDiff(crossId) {
        if (!crossDiffSettings[crossId]) {
            crossDiffSettings[crossId] = {
                enabled: true,
                topN: 0,
                bulbEnabled: true,
                bulbMethod: 'ztest'
            };
        } else {
            const newBulbEnabled = !crossDiffSettings[crossId].bulbEnabled;
            crossDiffSettings[crossId].bulbEnabled = newBulbEnabled;
            
            if (newBulbEnabled) {
                crossDiffSettings[crossId].enabled = true;
                crossDiffSettings[crossId].topN = 0;
            } else {
                crossDiffSettings[crossId].enabled = false;
            }
        }
        
        const taskId = document.getElementById(crossId).getAttribute('data-task');
        renderCross(taskId, crossId);
    }
    
    function setCrossDiffTopN(crossId, topN) {
        if (!crossDiffSettings[crossId]) {
            crossDiffSettings[crossId] = {
                enabled: true,
                topN: topN,
                bulbEnabled: false,
                bulbMethod: 'ztest'
            };
        } else {
            if (crossDiffSettings[crossId].topN === topN) {
                crossDiffSettings[crossId].enabled = false;
                crossDiffSettings[crossId].topN = 0;
                crossDiffSettings[crossId].bulbEnabled = false;
            } else {
                crossDiffSettings[crossId].enabled = true;
                crossDiffSettings[crossId].topN = topN;
                crossDiffSettings[crossId].bulbEnabled = false;
            }
        }
        
        const taskId = document.getElementById(crossId).getAttribute('data-task');
        renderCross(taskId, crossId);
    }
    
    function updateCrossAnalysis(taskId) {
        const crossBlocks = document.querySelectorAll(`#cross_area_${taskId} .cross-sub-block`);
        // 使用setTimeout避免阻塞
        setTimeout(() => {
            crossBlocks.forEach(block => {
                const crossId = block.id;
                renderCross(taskId, crossId);
            });
        }, 0);
    }
    
    // ================== 复制表格功能 ==================
    async function copyTable(tableId, button) {
        const table = document.getElementById(tableId);
        if (!table) return;
        
        if (button) {
            const originalText = button.querySelector('.copy-text')?.textContent || button.textContent;
            button.classList.add('copied');
            
            setTimeout(() => {
                button.classList.remove('copied');
            }, 800);
        }
        
        try {
            const tempContainer = document.createElement('div');
            tempContainer.style.position = 'fixed';
            tempContainer.style.left = '-9999px';
            
            const tableClone = table.cloneNode(true);
            
            Array.from(tableClone.rows).forEach((row, rowIndex) => {
                if (row.cells.length > 0 && 
                    (row.cells[0].textContent.includes('☰') || 
                     row.cells[0].classList.contains('col-sort') ||
                     row.cells[0].querySelector('.ico-round'))) {
                    row.deleteCell(0);
                }
                
                if (tableClone.classList.contains('cross-table')) {
                    const cells = Array.from(row.cells);
                    
                    if (rowIndex === 0) {
                        if (cells.length >= 3) {
                            const totalCell = cells[1];
                            const optionCell = cells[0];
                            
                            while (row.cells.length > 0) {
                                row.deleteCell(0);
                            }
                            
                            row.appendChild(optionCell.cloneNode(true));
                            row.appendChild(totalCell.cloneNode(true));
                            for (let i = 2; i < cells.length; i++) {
                                row.appendChild(cells[i].cloneNode(true));
                            }
                        }
                    } else {
                        if (cells.length >= 3) {
                            const totalCell = cells[1];
                            const optionCell = cells[0];
                            
                            while (row.cells.length > 0) {
                                row.deleteCell(0);
                            }
                            
                            row.appendChild(optionCell.cloneNode(true));
                            row.appendChild(totalCell.cloneNode(true));
                            for (let i = 2; i < cells.length; i++) {
                                row.appendChild(cells[i].cloneNode(true));
                            }
                        }
                    }
                }
            });
            
            const allElements = tableClone.querySelectorAll('*');
            allElements.forEach(el => {
                const computedStyle = window.getComputedStyle(el);
                const textStyles = {
                    color: computedStyle.color,
                    'font-family': computedStyle.fontFamily,
                    'font-size': computedStyle.fontSize,
                    'font-weight': computedStyle.fontWeight,
                    'font-style': computedStyle.fontStyle,
                    'text-align': computedStyle.textAlign
                };
                
                Object.entries(textStyles).forEach(([prop, value]) => {
                    if (value && !el.style[prop]) {
                        el.style[prop] = value;
                    }
                });
                
                el.style.background = '';
                el.style.backgroundColor = '';
                el.style.backgroundImage = '';
                el.style.setProperty('--bar-percent', '');
                
                el.classList.remove('bar-cell', 'drag-row', 'freeze-col', 'freeze-col-2');
                el.classList.remove('highlight-value', 'bulb-highlight', 'mean-row');
                
                if (el.classList.contains('base-cell') || el.classList.contains('col-name')) {
                    el.style.background = 'transparent';
                    el.style.backgroundColor = 'transparent';
                }
            });
            
            const icons = tableClone.querySelectorAll('.ico-round, .header-icons, .precision-btn, .diff-btn-container');
            icons.forEach(icon => icon.remove());
            
            const dragIcons = tableClone.querySelectorAll('[title*="拖动"], [title*="排序"]');
            dragIcons.forEach(icon => {
                if (icon.textContent.includes('☰')) {
                    icon.textContent = '';
                }
            });
            
            tempContainer.appendChild(tableClone);
            document.body.appendChild(tempContainer);
            
            let success = false;
            const html = tableClone.outerHTML;
            const text = Array.from(tableClone.rows).map(row => 
                Array.from(row.cells).map(cell => cell.textContent.trim()).join('\t')
            ).join('\n');

            try {
                if (navigator.clipboard && window.ClipboardItem && typeof navigator.clipboard.write === 'function') {
                    const blob = new Blob([`<meta charset="utf-8">${html}`], { type: 'text/html' });
                    const clipboardItem = new ClipboardItem({
                        'text/plain': new Blob([text], { type: 'text/plain' }),
                        'text/html': blob
                    });
                    await navigator.clipboard.write([clipboardItem]);
                    success = true;
                } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    await navigator.clipboard.writeText(text);
                    success = true;
                }
            } catch (err) {
                console.error('Clipboard API 复制失败:', err);
            }

            if (!success) {
                try {
                    const range = document.createRange();
                    range.selectNode(tableClone);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    success = document.execCommand('copy');
                    selection.removeAllRanges();
                } catch (err) {
                    console.error('execCommand 复制失败:', err);
                }
            }

            if (!success && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                try {
                    await navigator.clipboard.writeText(text);
                    success = true;
                } catch (err) {
                    console.error('writeText 兜底失败:', err);
                }
            }

            document.body.removeChild(tempContainer);
            
        } catch (err) {
            console.error('复制过程中出错:', err);
        }
    }
    
    // ================== 下载功能 ==================
    async function downloadAllTablesWithName() {
        if (!rawData) {
            alert('请先上传数据文件');
            return;
        }
        
        const defaultName = `数据分析_${new Date().getTime()}.xlsx`;
        const filename = await showFilenameDialog(defaultName);
        
        if (!filename) {
            return;
        }
        
        downloadAllTables(filename);
    }
    
    function downloadAllTables(filename = `数据分析_${new Date().getTime()}.xlsx`) {
        const wb = XLSX.utils.book_new();
        let combinedData = [];
        
        document.querySelectorAll('.task-block').forEach(block => {
            const selectEl = block.querySelector('.col-sel');
            if (selectEl && selectEl.value) {
                const colName = decodeURIComponent(selectEl.value);
                const tableId = `table_${block.id}`;
                const table = document.getElementById(tableId);
                
                if (table) {
                    combinedData.push([`分析题目: ${colName}`]);
                    combinedData.push([]);
                    
                    Array.from(table.rows).forEach(row => {
                        const rowData = Array.from(row.cells)
                            .slice(1)
                            .map(cell => cell.innerText.split('\n')[0].trim());
                        combinedData.push(rowData);
                    });
                    
                    combinedData.push([], []);
                }
            }
        });
        
        if (combinedData.length === 0) {
            alert('没有找到可导出的表格数据');
            return;
        }
        
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combinedData), "分析汇总");
        XLSX.writeFile(wb, filename);
    }
    
    // ================== 初始化 ==================
    document.addEventListener('DOMContentLoaded', function() {
        updateOnlineStatus();
        
        // 预加载字体，避免布局偏移
        document.fonts.ready.then(() => {
            console.log('字体加载完成');
        });
        
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(registration) {
                    console.log('ServiceWorker 注册成功: ', registration.scope);
                }).catch(function(err) {
                    console.log('ServiceWorker 注册失败: ', err);
                });
            });
        }
    });
