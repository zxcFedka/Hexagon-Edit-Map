// script.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Элементы
    const mapListUI = document.getElementById('map-list');
    const addMapBtn = document.getElementById('add-map-btn');
    const gridContainer = document.getElementById('grid-container');
    const canvas = document.getElementById('hexagon-canvas');
    const ctx = canvas.getContext('2d');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsFieldsUI = document.getElementById('settings-fields');
    const exportMapBtn = document.getElementById('export-map-btn');
    const noMapPlaceholder = document.getElementById('no-map-selected-placeholder');
    const noHexPlaceholder = document.getElementById('no-hex-selected-placeholder');
    const createMapModal = document.getElementById('create-map-modal');
    const newMapNameInput = document.getElementById('new-map-name-input');
    const confirmCreateMapBtn = document.getElementById('confirm-create-map-btn');
    const cancelCreateMapBtn = document.getElementById('cancel-create-map-btn');

    // Состояние
    let maps = {};
    let currentMapName = null;
    let selectedHexKey = null;
    const hexagonSize = 35; 
    const dotRadius = 1.5;
    const dotSpacing = 30; 
    const dotColor = "rgba(70, 70, 70, 0.6)"; 

    let cameraOffset = { x: 0, y: 0 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    let mouseHexKey = null; 
    let hoveredHexKeyForEffects = null; 
    let isCtrlPressed = false;
    let linkingHexFromKey = null;
    let currentMousePosCanvas = { x: 0, y: 0 };

    let opacityAnimStore = {}; 
    const OPACITY_ANIM_DURATION = 500; 
    let opacityAnimationId = null;

    let activeLabel = {
        hexKey: null, lineProgress: 0, textScrambleProgress: 0, 
        displayText: "", targetTitle: "", animationId: null,
        lineStartTimestamp: 0, textStartTimestamp: 0,
    };
    const LABEL_LINE_DURATION = 200; 
    const LABEL_TEXT_REVEAL_DURATION = 300; 
    const LABEL_TEXT_SCRAMBLE_CHARS_PER_FRAME = 2; 
    const LABEL_CALLOUT_LINE_LENGTH_SEG1 = 20;
    const LABEL_CALLOUT_LINE_LENGTH_SEG2 = 80;
    const scrambleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_!@#%^&*()-+=[]{};':,.<>/?";

    const LOCAL_STORAGE_KEY = 'hexagonMapEditor_mapsData_v1';

    function quadraticEaseOut(t) { return t * (2 - t); }
    function getRandomChar() { return scrambleChars[Math.floor(Math.random() * scrambleChars.length)]; }

    function saveMapsToLocalStorage() {
        try {
            const dataToSave = { maps: maps, currentMapName: currentMapName };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
            console.log("Карты сохранены в localStorage");
        } catch (e) { console.error("Ошибка сохранения карт в localStorage:", e); }
    }

    function loadMapsFromLocalStorage() {
        try {
            const mapsJson = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (mapsJson) {
                const data = JSON.parse(mapsJson);
                maps = data.maps || {};
                if (data.currentMapName && maps[data.currentMapName]) {
                    currentMapName = data.currentMapName;
                } else if (Object.keys(maps).length > 0) {
                    currentMapName = Object.keys(maps)[0];
                } else {
                    currentMapName = null;
                }
                console.log("Карты загружены из localStorage:", maps);
            } else {
                console.log("Нет сохраненных карт в localStorage."); maps = {}; currentMapName = null;
            }
        } catch (e) {
            console.error("Ошибка загрузки карт из localStorage:", e); maps = {}; currentMapName = null;
        }
    }

    function init() {
        console.log("Инициализация редактора...");
        loadMapsFromLocalStorage();
        resizeCanvas(); 
        renderMapList();    
        selectMap(currentMapName); 
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control' && !isCtrlPressed) { isCtrlPressed = true; if (currentMapName) renderCurrentMap(); }
            if (e.key === 'Escape' && createMapModal.style.display !== 'none') closeCreateMapModal();
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') { isCtrlPressed = false; if (linkingHexFromKey) linkingHexFromKey = null; 
                if (currentMapName) renderCurrentMap();
            }
        });
        addMapBtn.addEventListener('click', openCreateMapModal);
        confirmCreateMapBtn.addEventListener('click', handleConfirmCreateMap);
        cancelCreateMapBtn.addEventListener('click', closeCreateMapModal);
        createMapModal.addEventListener('click', (e) => { if (e.target === createMapModal) closeCreateMapModal(); });
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('contextmenu', (e) => { if (isPanning) e.preventDefault(); });
    }
    
    function openCreateMapModal() {
        newMapNameInput.value = ""; createMapModal.style.display = 'flex'; newMapNameInput.focus();
    }
    function closeCreateMapModal() {
        createMapModal.style.display = 'none';
    }
    function handleConfirmCreateMap() {
        const mapName = newMapNameInput.value.trim();
        if (mapName) {
            if (!maps[mapName]) {
                maps[mapName] = { hexes: {}, settings: {} }; currentMapName = mapName; 
                saveMapsToLocalStorage();   
                renderMapList(); selectMap(mapName); closeCreateMapModal();
            } else { alert("Карта с таким именем уже существует!"); newMapNameInput.select(); }
        } else { alert("Имя карты не может быть пустым."); newMapNameInput.focus(); }
    }
    
    function startOpacityAnimation(hexKey, targetOpacity) { if (!currentMapName || !maps[currentMapName] || !maps[currentMapName].hexes[hexKey]) return; const hexState = opacityAnimStore[hexKey] || { current: 1.0, target: 1.0, startTime: 0, initial: 1.0 }; if (hexState.target === targetOpacity && Math.abs(hexState.current - targetOpacity) < 0.01) return; hexState.target = targetOpacity; hexState.startTime = performance.now(); hexState.initial = hexState.current; opacityAnimStore[hexKey] = hexState; if (!opacityAnimationId) opacityAnimationId = requestAnimationFrame(animateOpacities); }
    function animateOpacities(timestamp) { let stillAnimatingOpacities = false; if (maps[currentMapName]) { for (const key in opacityAnimStore) { if (!maps[currentMapName].hexes[key]) { delete opacityAnimStore[key]; continue; } const state = opacityAnimStore[key]; if (state.current !== state.target) { const elapsed = timestamp - state.startTime; let progress = Math.min(1, elapsed / OPACITY_ANIM_DURATION); state.current = state.initial + (state.target - state.initial) * quadraticEaseOut(progress); if (progress < 1) stillAnimatingOpacities = true; else { state.current = state.target; if (state.target === 1.0 && key !== hoveredHexKeyForEffects) { /* delete opacityAnimStore[key]; */ } } } } } if (stillAnimatingOpacities || activeLabel.animationId) renderCurrentMap(); if (stillAnimatingOpacities) opacityAnimationId = requestAnimationFrame(animateOpacities); else opacityAnimationId = null; }
    function startLabelAnimation(hexKey) { if (activeLabel.animationId) cancelAnimationFrame(activeLabel.animationId); if (!currentMapName || !maps[currentMapName] || !maps[currentMapName].hexes[hexKey]) return; const hexData = maps[currentMapName].hexes[hexKey]; activeLabel.hexKey = hexKey; activeLabel.targetTitle = hexData.properties.Title || `Hex_${hexData.Q}_${hexData.R}`; activeLabel.lineProgress = 0; activeLabel.textScrambleProgress = 0; activeLabel.displayText = ""; activeLabel.lineStartTimestamp = performance.now(); activeLabel.textStartTimestamp = 0; activeLabel.animationId = requestAnimationFrame(animateLabel); }
    function clearLabelAnimation() { if (activeLabel.animationId) cancelAnimationFrame(activeLabel.animationId); const needsRedraw = activeLabel.hexKey !== null; activeLabel.hexKey = null; activeLabel.animationId = null; if (needsRedraw && !opacityAnimationId) renderCurrentMap(); }
    function animateLabel(timestamp) { if (!activeLabel.hexKey || !currentMapName || !maps[currentMapName].hexes[activeLabel.hexKey]) { clearLabelAnimation(); return; } let needsAnotherFrame = false; if (activeLabel.lineProgress < 1) { const elapsedLine = timestamp - activeLabel.lineStartTimestamp; activeLabel.lineProgress = Math.min(1, elapsedLine / LABEL_LINE_DURATION); needsAnotherFrame = true; } if (activeLabel.lineProgress === 1) { if (activeLabel.textStartTimestamp === 0) activeLabel.textStartTimestamp = timestamp; const elapsedText = timestamp - activeLabel.textStartTimestamp; activeLabel.textScrambleProgress = Math.min(1, elapsedText / LABEL_TEXT_REVEAL_DURATION); if (activeLabel.textScrambleProgress < 1) { let newText = ""; const revealUpTo = Math.floor(activeLabel.targetTitle.length * activeLabel.textScrambleProgress); for(let i=0; i< activeLabel.targetTitle.length; i++) { if (i <= revealUpTo) newText += activeLabel.targetTitle[i]; else if (i < revealUpTo + LABEL_TEXT_SCRAMBLE_CHARS_PER_FRAME) newText += getRandomChar(); else newText += " "; } activeLabel.displayText = newText.trimEnd(); needsAnotherFrame = true; } else activeLabel.displayText = activeLabel.targetTitle; } if (!opacityAnimationId) renderCurrentMap(); if (needsAnotherFrame) activeLabel.animationId = requestAnimationFrame(animateLabel); else activeLabel.animationId = null; }
    
    function renderMapList() {
        mapListUI.innerHTML = '';
        Object.keys(maps).forEach(name => {
            const li = document.createElement('li');
            li.dataset.mapName = name;

            // Элемент для имени карты
            const nameSpan = document.createElement('span');
            nameSpan.className = 'map-name-text';
            nameSpan.textContent = name;
            li.appendChild(nameSpan);

            // Контейнер для иконок действий
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'map-item-actions';

            // Иконка скачивания
            const downloadIcon = document.createElement('span');
            downloadIcon.className = 'download-map-icon';
            downloadIcon.textContent = '💾'; // Unicode символ дискеты (или ↓, или SVG)
            downloadIcon.title = 'Download this map';
            downloadIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем срабатывание клика по li (выбор карты)
                handleDownloadSpecificMap(name);
            });
            actionsDiv.appendChild(downloadIcon);

            // Иконка удаления
            const deleteIcon = document.createElement('span');
            deleteIcon.className = 'delete-map-icon';
            deleteIcon.textContent = '🗑️'; // Unicode символ корзины (или X, или SVG)
            deleteIcon.title = 'Delete this map';
            deleteIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем срабатывание клика по li
                handleDeleteMap(name);
            });
            actionsDiv.appendChild(deleteIcon);

            li.appendChild(actionsDiv);

            if (name === currentMapName) {
                li.classList.add('active');
            }
            // Клик по самому элементу списка (не по иконкам) по-прежнему выбирает карту
            li.addEventListener('click', (event) => {
                // Убедимся, что клик был не по иконке, хотя stopPropagation должен это решить
                if (event.target === li || event.target === nameSpan) {
                    selectMap(name);
                }
            });
            mapListUI.appendChild(li);
        });
    }

    function handleDeleteMap(mapNameToDelete) {
        if (!maps[mapNameToDelete]) return;

        if (confirm(`Are you sure you want to delete map "${mapNameToDelete}"? This action cannot be undone.`)) {
            delete maps[mapNameToDelete];
            console.log(`Map "${mapNameToDelete}" deleted.`);

            if (currentMapName === mapNameToDelete) {
                // Если удалили текущую карту, выбираем первую из оставшихся или никакую
                const remainingMapNames = Object.keys(maps);
                currentMapName = remainingMapNames.length > 0 ? remainingMapNames[0] : null;
                selectMap(currentMapName); // Обновит UI, очистит холст если карт нет
            } else {
                // Если удалили не активную карту, просто перерисовываем список
                renderMapList(); // Чтобы активный элемент остался прежним
            }
            saveMapsToLocalStorage();
        }
    }

    function handleDownloadSpecificMap(mapNameToDownload) {
        const luaString = generateLuaForMap(mapNameToDownload);
        if (luaString) {
            downloadLuaFile(luaString, `${mapNameToDownload}.lua`);
        } else {
            alert(`Could not export map "${mapNameToDownload}". It might be empty or not found.`);
        }
    }

    function generateLuaForMap(mapNameToExport) {
        if (!maps[mapNameToExport]) {
            console.error(`Map "${mapNameToExport}" not found for export.`);
            return null;
        }
        const mapData = maps[mapNameToExport];
        if (Object.keys(mapData.hexes).length === 0) {
            console.warn(`Map "${mapNameToExport}" contains no hexes to export.`);
            // Можно вернуть пустую таблицу или null/undefined
            return "return {}\n";
        }

        let luaString = "return {\n";
        const hexEntries = Object.entries(mapData.hexes);
        const hexToLuaKeyMap = new Map();
        const usedLuaKeys = new Set();

        hexEntries.forEach(([original_QR_Key, hex]) => {
            let baseTitle = (hex.properties.Title || "").trim();
            if (baseTitle === "") baseTitle = `Hex_${hex.Q}_${hex.R}`;
            let uniqueLuaKey = baseTitle;
            let counter = 1;
            while (usedLuaKeys.has(uniqueLuaKey)) {
                uniqueLuaKey = `${baseTitle}_${counter++}`;
            }
            usedLuaKeys.add(uniqueLuaKey);
            hexToLuaKeyMap.set(original_QR_Key, uniqueLuaKey);
        });

        hexEntries.forEach(([original_QR_Key, hex], index) => {
            const uniqueLuaKey = hexToLuaKeyMap.get(original_QR_Key);
            luaString += `\t["${escapeLuaString(uniqueLuaKey)}"] = {\n`;
            luaString += `\t\tQ = ${hex.Q},\n`;
            luaString += `\t\tR = ${hex.R},\n`;
            settingsSchema.forEach(setting => { // Убедись что settingsSchema доступна здесь
                if (setting.luaName === "NextHex") return;
                const value = hex.properties[setting.name];
                if (value !== undefined) {
                    if (setting.type === 'string') luaString += `\t\t${setting.luaName} = "${escapeLuaString(String(value))}",\n`;
                    else if (setting.type === 'number') luaString += `\t\t${setting.luaName} = ${parseFloat(value) || 0},\n`;
                    else if (setting.type === 'boolean') luaString += `\t\t${setting.luaName} = ${value ? 'true' : 'false'},\n`;
                }
            });
            if (hex.properties.NextHex && hex.properties.NextHex.length > 0) {
                luaString += `\t\tNextHex = {\n`;
                hex.properties.NextHex.forEach(targetHex_QR_Key => {
                    const uniqueLuaKeyOfTarget = hexToLuaKeyMap.get(targetHex_QR_Key);
                    if (uniqueLuaKeyOfTarget) {
                        luaString += `\t\t\t"${escapeLuaString(uniqueLuaKeyOfTarget)}",\n`;
                    } else {
                        console.warn(`Экспорт для "${uniqueLuaKey}": Не удалось найти Lua-ключ для NextHex соседа с Q,R: "${targetHex_QR_Key}"`);
                    }
                });
                luaString += `\t\t}\n`;
            } else {
                luaString += `\t\tNextHex = {}\n`;
            }
            luaString = luaString.trimEnd().endsWith(',') ? luaString.slice(0, -1) + "\n" : luaString;
            luaString += `\t}${index === hexEntries.length - 1 ? '' : ','}\n`;
        });
        luaString += "}\n";
        return luaString;
    }

    function selectMap(mapName) { currentMapName = (mapName && maps[mapName]) ? mapName : null; selectedHexKey = null; linkingHexFromKey = null; mouseHexKey = null; hoveredHexKeyForEffects = null; isCtrlPressed = false; if (isPanning) isPanning = false; cameraOffset = { x: canvas.width / 2, y: canvas.height / 2 }; canvas.style.cursor = currentMapName ? 'grab' : 'default'; clearLabelAnimation(); opacityAnimStore = {}; if (opacityAnimationId) {cancelAnimationFrame(opacityAnimationId); opacityAnimationId = null;} if (activeLabel.animationId) {cancelAnimationFrame(activeLabel.animationId); activeLabel.animationId = null;} saveMapsToLocalStorage(); renderMapList(); renderSettingsPanel(); renderCurrentMap(); exportMapBtn.style.display = currentMapName ? 'block' : 'none'; noMapPlaceholder.style.display = currentMapName ? 'none' : 'block'; canvas.style.display = currentMapName ? 'block' : 'none'; }
    function resizeCanvas() { canvas.width = gridContainer.clientWidth; canvas.height = gridContainer.clientHeight; if (currentMapName) { cameraOffset = { x: canvas.width / 2, y: canvas.height / 2 }; renderCurrentMap(); } }
    window.addEventListener('resize', resizeCanvas);
    function handleMouseDown(event) { if (event.button === 1 || event.button === 2) { isPanning = true; panStart.x = event.clientX - cameraOffset.x; panStart.y = event.clientY - cameraOffset.y; canvas.style.cursor = 'grabbing'; if (event.button === 2) event.preventDefault(); } }
    function handleMouseUp(event) { if (isPanning && (event.button === 1 || event.button === 2)) { isPanning = false; canvas.style.cursor = currentMapName ? 'grab' : 'default'; } }
    function screenToWorldCoords(screenX, screenY) { return { x: screenX - cameraOffset.x, y: screenY - cameraOffset.y }; }
    function worldToScreenCoords(worldX, worldY) { return { x: worldX + cameraOffset.x, y: worldY + cameraOffset.y }; }
    function getHexKeyFromScreenCoords(screenX, screenY) { const worldCoords = screenToWorldCoords(screenX, screenY); const coords = HexMath.pixelToHex(worldCoords.x, worldCoords.y, hexagonSize); return `${coords.q},${coords.r}`; }
    function handleMouseMove(event) { if (!currentMapName) return; const rect = canvas.getBoundingClientRect(); const mouseX = event.clientX - rect.left; const mouseY = event.clientY - rect.top; currentMousePosCanvas = { x: mouseX, y: mouseY }; if (isPanning) { cameraOffset.x = event.clientX - panStart.x; cameraOffset.y = event.clientY - panStart.y; if (!activeLabel.animationId && !opacityAnimationId) renderCurrentMap(); return; } const newMouseHexKeyUnderCursor = getHexKeyFromScreenCoords(mouseX, mouseY); mouseHexKey = newMouseHexKeyUnderCursor; let newHoveredForKey = null; if (newMouseHexKeyUnderCursor && maps[currentMapName].hexes[newMouseHexKeyUnderCursor]) newHoveredForKey = newMouseHexKeyUnderCursor; if (hoveredHexKeyForEffects !== newHoveredForKey) { if (hoveredHexKeyForEffects && maps[currentMapName] && maps[currentMapName].hexes[hoveredHexKeyForEffects]) { startOpacityAnimation(hoveredHexKeyForEffects, 1.0); clearLabelAnimation(); } if (newHoveredForKey) { startOpacityAnimation(newHoveredForKey, 0.5); startLabelAnimation(newHoveredForKey); } hoveredHexKeyForEffects = newHoveredForKey; } if ( (isCtrlPressed && linkingHexFromKey) || (newMouseHexKeyUnderCursor !== hoveredHexKeyForEffects) ) { if (!activeLabel.animationId && !opacityAnimationId) renderCurrentMap(); } }
    function handleMouseLeave() { mouseHexKey = null; if (hoveredHexKeyForEffects && maps[currentMapName] && maps[currentMapName].hexes[hoveredHexKeyForEffects]) startOpacityAnimation(hoveredHexKeyForEffects, 1.0); clearLabelAnimation(); hoveredHexKeyForEffects = null; if (isPanning) { isPanning = false; canvas.style.cursor = currentMapName ? 'grab' : 'default'; } }
    
    function handleCanvasClick(event) {
        if (!currentMapName || !maps[currentMapName] || isPanning) return;

        const rect = canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const clickedKey = getHexKeyFromScreenCoords(screenX, screenY); // e.g., "q,r"
        const mapData = maps[currentMapName];
        let dataChangedInOriginalLogic = false; // Переименовал для ясности

        // --- Логика для Alt+Click (Удаление гексагона) ---
        if (event.altKey) {
            if (mapData.hexes[clickedKey]) {
                const hexToDelete = mapData.hexes[clickedKey];
                const hexDisplayName = hexToDelete.properties.Title || `Hex (${hexToDelete.Q},${hexToDelete.R})`;

                if (confirm(`Are you sure you want to delete hexagon "${hexDisplayName}"? This action cannot be undone.`)) {
                    // 1. Удалить ссылки на этот гексагон из других гексагонов (из их NextHex)
                    const deletedHex_QR_Key = clickedKey;
                    Object.values(mapData.hexes).forEach(hex => {
                        if (hex.properties.NextHex && hex.properties.NextHex.includes(deletedHex_QR_Key)) {
                            hex.properties.NextHex = hex.properties.NextHex.filter(key => key !== deletedHex_QR_Key);
                            // Это изменение данных, которое также нужно сохранить
                        }
                    });

                    // 2. Удалить сам гексагон
                    delete mapData.hexes[clickedKey];
                    console.log(`Hexagon ${clickedKey} ("${hexDisplayName}") deleted.`);

                    // 3. Обновить состояние, если удаленный гексагон был активным/выбранным/и т.д.
                    if (selectedHexKey === clickedKey) {
                        selectedHexKey = null;
                    }
                    if (hoveredHexKeyForEffects === clickedKey) {
                        // Очистить анимацию метки, если она была для этого гекса
                        if (activeLabel.hexKey === clickedKey) {
                            clearLabelAnimation();
                        }
                        // Удалить из хранилища анимации прозрачности
                        if (opacityAnimStore[clickedKey]) {
                            delete opacityAnimStore[clickedKey];
                        }
                        hoveredHexKeyForEffects = null; // Сбросить состояние наведения
                    }
                    // Если метка была активна для удаленного гекса, но он не был под курсором в момент удаления
                    if (activeLabel.hexKey === clickedKey && hoveredHexKeyForEffects !== clickedKey) {
                        clearLabelAnimation();
                    }
                    if (linkingHexFromKey === clickedKey) {
                        linkingHexFromKey = null; // Отменить связывание, если начиналось с этого гекса
                    }

                    // Сохранить изменения и перерисовать
                    saveMapsToLocalStorage();
                    renderCurrentMap();
                    renderSettingsPanel(); // Обновит панель настроек (покажет плейсхолдер, если гекс был выбран)
                }
            }
            // Важно: после обработки Alt+клика (или попытки) завершаем выполнение,
            // чтобы не сработала остальная логика клика (создание/выбор).
            return;
        }

        // --- Существующая логика для Ctrl+Click и обычного клика ---
        // (Этот блок выполнится, только если event.altKey === false)

        if (isCtrlPressed) {
            if (mapData.hexes[clickedKey]) { // Ctrl+клик на существующий гекс
                if (!linkingHexFromKey) {
                    linkingHexFromKey = clickedKey;
                    selectedHexKey = clickedKey; // Выбираем гекс, с которого начинаем связь
                } else { // Второй Ctrl+клик для завершения связи
                    if (linkingHexFromKey !== clickedKey) { // Связываем с другим гексом
                        const fromHexData = mapData.hexes[linkingHexFromKey];
                        const toHexData = mapData.hexes[clickedKey];
                        if (!fromHexData.properties.NextHex) fromHexData.properties.NextHex = [];
                        const targetHex_QR_Key = `${toHexData.Q},${toHexData.R}`;
                        if (!fromHexData.properties.NextHex.includes(targetHex_QR_Key)) {
                            fromHexData.properties.NextHex.push(targetHex_QR_Key);
                            dataChangedInOriginalLogic = true;
                        }
                        selectedHexKey = clickedKey; // Выбираем целевой гекс
                    } else { // Ctrl+клик на тот же самый гекс (завершаем/отменяем связывание)
                        selectedHexKey = clickedKey; // Просто убеждаемся, что он выбран
                    }
                    linkingHexFromKey = null; // Завершаем операцию связывания
                }
            } else { // Ctrl+клик на пустое место
                linkingHexFromKey = null; // Отменяем связывание
            }
        } else { // Обычный клик (не Alt, не Ctrl)
            linkingHexFromKey = null; // Отменяем любое ожидающее связывание

            if (mapData.hexes[clickedKey]) { // Клик на существующий гекс
                selectedHexKey = clickedKey;
            } else { // Клик на пустое место - попытка создать новый гекс
                const [q, r] = clickedKey.split(',').map(Number);
                const neighbors = HexMath.getNeighbors(q, r);
                let isAdjacent = Object.keys(mapData.hexes).length === 0; // Первый гекс можно ставить где угодно
                if (!isAdjacent) {
                    for (const neighbor of neighbors) {
                        if (mapData.hexes[`${neighbor.q},${neighbor.r}`]) {
                            isAdjacent = true;
                            break;
                        }
                    }
                }
                if (isAdjacent) {
                    const newHexData = { Q: q, R: r, properties: getDefaultHexProperties() };
                    if (Object.keys(mapData.hexes).length === 0) newHexData.properties.Title = "Start";
                    mapData.hexes[clickedKey] = newHexData;
                    selectedHexKey = clickedKey;
                    dataChangedInOriginalLogic = true;
                }
            }
        }

        if (dataChangedInOriginalLogic) {
            saveMapsToLocalStorage();
        }
        renderCurrentMap(); // Перерисовываем карту после любого клика, который мог изменить состояние
        renderSettingsPanel(); // Перерисовываем панель настроек
    }

    function renderCurrentMap() {
        if (!currentMapName || !maps[currentMapName] || !canvas.getContext) {
            if (canvas.getContext) ctx.clearRect(0, 0, canvas.width, canvas.height); return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height); const mapData = maps[currentMapName];
        ctx.save(); ctx.translate(cameraOffset.x, cameraOffset.y); ctx.fillStyle = dotColor;
        const worldViewLeft = -cameraOffset.x; const worldViewTop = -cameraOffset.y;
        const worldViewRight = canvas.width - cameraOffset.x; const worldViewBottom = canvas.height - cameraOffset.y;
        const startX = Math.floor(worldViewLeft / dotSpacing) * dotSpacing;
        const startY = Math.floor(worldViewTop / dotSpacing) * dotSpacing;
        for (let x = startX; x < worldViewRight; x += dotSpacing) {
            for (let y = startY; y < worldViewBottom; y += dotSpacing) {
                ctx.beginPath(); ctx.arc(x, y, dotRadius, 0, 2 * Math.PI); ctx.fill();
            }
        }
        ctx.restore(); 
        ctx.save(); ctx.translate(cameraOffset.x, cameraOffset.y);
        Object.entries(mapData.hexes).forEach(([key, hexData]) => {
            const pixelCoords = HexMath.hexToPixel(hexData.Q, hexData.R, hexagonSize);
            drawHexagon(pixelCoords.x, pixelCoords.y, hexagonSize, hexData.properties.Title || "", key === selectedHexKey, false, key);
            if (isCtrlPressed && linkingHexFromKey === key) {
                ctx.beginPath(); ctx.arc(pixelCoords.x, pixelCoords.y, 5, 0, 2 * Math.PI); ctx.fillStyle = 'yellow'; ctx.fill();
            }
        });
        if (mouseHexKey && !mapData.hexes[mouseHexKey] && !hoveredHexKeyForEffects) { 
            const [mq, mr] = mouseHexKey.split(',').map(Number); const neighbors = HexMath.getNeighbors(mq, mr);
            let isAdjacentToExisting = Object.keys(mapData.hexes).length === 0;
            if (!isAdjacentToExisting) { for (const neighbor of neighbors) { if (mapData.hexes[`${neighbor.q},${neighbor.r}`]) { isAdjacentToExisting = true; break; } } }
            if (isAdjacentToExisting) { const pixelCoords = HexMath.hexToPixel(mq, mr, hexagonSize); drawHexagon(pixelCoords.x, pixelCoords.y, hexagonSize, "", false, true, mouseHexKey); }
        }
        if (isCtrlPressed) {
            Object.values(mapData.hexes).forEach(fromHex => {
                if (fromHex.properties.NextHex && fromHex.properties.NextHex.length > 0) {
                    const fromPixel = HexMath.hexToPixel(fromHex.Q, fromHex.R, hexagonSize);
                    fromHex.properties.NextHex.forEach(targetHex_QR_Key => {
                        const toHex = mapData.hexes[targetHex_QR_Key]; 
                        if (toHex) {
                            const toPixel = HexMath.hexToPixel(toHex.Q, toHex.R, hexagonSize);
                            ctx.beginPath(); ctx.moveTo(fromPixel.x, fromPixel.y); ctx.lineTo(toPixel.x, toPixel.y);
                            ctx.strokeStyle = 'rgba(180, 180, 255, 0.7)'; ctx.lineWidth = 2; ctx.stroke();
                        } else { console.warn(`Отрисовка: Не найден целевой гекс для NextHex с ключом: ${targetHex_QR_Key} из гекса Q=${fromHex.Q},R=${fromHex.R}`); }
                    });
                }
            });
        }
        ctx.restore(); 
        if (activeLabel.hexKey && maps[currentMapName] && maps[currentMapName].hexes[activeLabel.hexKey]) {
            const hexDataForLabel = maps[currentMapName].hexes[activeLabel.hexKey];
            const worldHexCenter = HexMath.hexToPixel(hexDataForLabel.Q, hexDataForLabel.R, hexagonSize);
            const worldHexCorners = HexMath.getHexCorners(worldHexCenter.x, worldHexCenter.y, hexagonSize);
            let bestCalloutInfo = null; const calloutPositions = [
                { vIdx: 0, nDelta: { q: 1, r: 0 }, angle: -Math.PI / 6, align: "left" }, { vIdx: 5, nDelta: { q: 1, r:-1 }, angle:  Math.PI / 6, align: "left" },
                { vIdx: 2, nDelta: { q:-1, r: 0 }, angle: -5*Math.PI / 6, align: "right" }, { vIdx: 3, nDelta: { q:-1, r: 1 }, angle:  5*Math.PI / 6, align: "right" },
            ];
            for (const pos of calloutPositions) {
                const nQ = hexDataForLabel.Q + pos.nDelta.q; const nR = hexDataForLabel.R + pos.nDelta.r;
                if (!mapData.hexes[`${nQ},${nR}`]) { bestCalloutInfo = { startWorld: worldHexCorners[pos.vIdx], angleRad: pos.angle, textAlign: pos.align }; break; }
            }
            if (!bestCalloutInfo) { bestCalloutInfo = { startWorld: worldHexCorners[0], angleRad: -Math.PI / 6, textAlign: "left" }; }
            const lineStartScreen = worldToScreenCoords(bestCalloutInfo.startWorld.x, bestCalloutInfo.startWorld.y);
            const p1 = { x: lineStartScreen.x, y: lineStartScreen.y };
            const p2 = { x: p1.x + LABEL_CALLOUT_LINE_LENGTH_SEG1 * Math.cos(bestCalloutInfo.angleRad), y: p1.y + LABEL_CALLOUT_LINE_LENGTH_SEG1 * Math.sin(bestCalloutInfo.angleRad) };
            let p3_x_offset = LABEL_CALLOUT_LINE_LENGTH_SEG2; if(bestCalloutInfo.textAlign === "right") p3_x_offset = -LABEL_CALLOUT_LINE_LENGTH_SEG2;
            const p3 = { x: p2.x + p3_x_offset, y: p2.y };
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
            if (activeLabel.lineProgress > 0) {
                const totalLengthSeg1 = LABEL_CALLOUT_LINE_LENGTH_SEG1; const currentTotalAnimatedLength = (totalLengthSeg1 + Math.abs(p3.x - p2.x)) * activeLabel.lineProgress;
                if (currentTotalAnimatedLength <= totalLengthSeg1) {
                    const progressOnSeg1 = currentTotalAnimatedLength / totalLengthSeg1; ctx.lineTo(p1.x + (p2.x - p1.x) * progressOnSeg1, p1.y + (p2.y - p1.y) * progressOnSeg1);
                } else {
                    ctx.lineTo(p2.x, p2.y); const lengthOnSeg2 = currentTotalAnimatedLength - totalLengthSeg1;
                    const progressOnSeg2 = Math.abs(p3.x - p2.x) > 0 ? lengthOnSeg2 / Math.abs(p3.x - p2.x) : 1;
                    ctx.lineTo(p2.x + (p3.x - p2.x) * progressOnSeg2, p2.y + (p3.y - p2.y) * progressOnSeg2);
                }
            }
            ctx.strokeStyle = "#cccccc"; ctx.lineWidth = 1; ctx.stroke();
            if (activeLabel.lineProgress === 1 && activeLabel.displayText) {
                ctx.fillStyle = "#cccccc"; ctx.font = "13px Space Mono"; ctx.textBaseline = "middle";
                let textX = p3.x + 5; ctx.textAlign = bestCalloutInfo.textAlign;
                if (bestCalloutInfo.textAlign === "right") textX = p3.x - 5; else if (bestCalloutInfo.textAlign === "center") textX = p3.x;
                ctx.fillText(activeLabel.displayText, textX, p3.y);
            }
        }
        if (isCtrlPressed && linkingHexFromKey && mapData.hexes[linkingHexFromKey]) {
            const fromHexData = mapData.hexes[linkingHexFromKey]; const originWorldPixel = HexMath.hexToPixel(fromHexData.Q, fromHexData.R, hexagonSize);
            const originScreenPixel = worldToScreenCoords(originWorldPixel.x, originWorldPixel.y);
            ctx.beginPath(); ctx.moveTo(originScreenPixel.x, originScreenPixel.y); ctx.lineTo(currentMousePosCanvas.x, currentMousePosCanvas.y);
            ctx.strokeStyle = 'yellow'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
        }
    }
    
    function drawHexagon(centerX, centerY, size, text, isSelected, isPlaceholder = false, hexKey) {
        const corners = HexMath.getHexCorners(centerX, centerY, size);
        ctx.beginPath(); corners.forEach((corner, i) => { if (i === 0) ctx.moveTo(corner.x, corner.y); else ctx.lineTo(corner.x, corner.y); }); ctx.closePath();
        ctx.lineWidth = isSelected ? 2 : 1;
        let baseFillStyle = '#555555';
        if (isSelected) baseFillStyle = '#77aaff'; else if (isPlaceholder) baseFillStyle = 'rgba(120, 120, 120, 0.3)';
        let currentOpacity = 1.0;
        if (!isPlaceholder && opacityAnimStore[hexKey]) currentOpacity = opacityAnimStore[hexKey].current; else if (isPlaceholder) currentOpacity = 0.3;
        if (baseFillStyle.startsWith('#') && !isPlaceholder) {
            const r = parseInt(baseFillStyle.slice(1, 3), 16); const g = parseInt(baseFillStyle.slice(3, 5), 16); const b = parseInt(baseFillStyle.slice(5, 7), 16);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${currentOpacity})`;
        } else ctx.fillStyle = baseFillStyle; 
        ctx.strokeStyle = isSelected ? '#ffffff' : (isPlaceholder ? '#777777' : '#888888');
        ctx.fill(); ctx.stroke();
        if (text && !isPlaceholder) {
            ctx.fillStyle = '#dddddd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const maxWidth = size * 1.5;
            if (ctx.measureText(text).width > maxWidth && text.length > 3) {
                 let shortText = text;
                 if (text.length > 15) shortText = text.substring(0,12) + "..."; else if (text.length > 10) shortText = text.substring(0,8) + "..."; else if (text.length > 7) shortText = text.substring(0,5) + "...";
                 text = shortText;
            } ctx.fillText(text, centerX, centerY);
        }
    }

    function renderSettingsPanel() {
        settingsFieldsUI.innerHTML = ''; if (!currentMapName || !selectedHexKey || !maps[currentMapName] || !maps[currentMapName].hexes[selectedHexKey]) { settingsFieldsUI.appendChild(noHexPlaceholder); noHexPlaceholder.style.display = 'block'; return; }
        noHexPlaceholder.style.display = 'none'; const hexData = maps[currentMapName].hexes[selectedHexKey];
        settingsSchema.forEach(setting => {
            const propName = setting.name; const propType = setting.type; if (setting.luaName === "NextHex") return; 
            const currentValue = hexData.properties[propName]; const displayLabel = setting.luaName.charAt(0).toUpperCase() + setting.luaName.slice(1);
            const label = document.createElement('label'); label.htmlFor = `setting-${propName}`; label.textContent = displayLabel + ":"; let input;
            if (propType === 'string' || propType === 'number') {
                input = document.createElement(propType === 'string' ? 'input' : 'input'); input.type = propType === 'string' ? 'text' : 'number'; input.id = `setting-${propName}`;
                input.value = currentValue !== undefined ? currentValue : setting.defaultValue;
                input.addEventListener('input', (e) => { hexData.properties[propName] = propType === 'number' ? parseFloat(e.target.value) : e.target.value; if (propName === 'Title') renderCurrentMap(); saveMapsToLocalStorage(); });
            } else if (propType === 'boolean') {
                const checkWrapper = document.createElement('div'); input = document.createElement('input'); input.type = 'checkbox'; input.id = `setting-${propName}`;
                input.checked = currentValue !== undefined ? currentValue : setting.defaultValue;
                input.addEventListener('change', (e) => { hexData.properties[propName] = e.target.checked; saveMapsToLocalStorage(); });
                const checkLabel = document.createElement('label'); checkLabel.htmlFor = `setting-${propName}`; checkLabel.textContent = " " + displayLabel; checkLabel.className = 'checkbox-label';
                checkWrapper.appendChild(input); checkWrapper.appendChild(checkLabel); settingsFieldsUI.appendChild(checkWrapper); return; 
            }
            settingsFieldsUI.appendChild(label); if (input) settingsFieldsUI.appendChild(input);
        });
    }
    
    exportMapBtn.addEventListener('click', () => {
        if (!currentMapName) {
            alert("Карта не выбрана.");
            return;
        }
        const luaString = generateLuaForMap(currentMapName);
        if (luaString) {
            downloadLuaFile(luaString, `${currentMapName}.lua`);
        } else {
            alert(`Could not export map "${currentMapName}". It might be empty or not found.`);
        }
    });

    function getDefaultHexProperties() {
        const defaults = {}; settingsSchema.forEach(setting => { if (setting.luaName !== "NextHex") defaults[setting.name] = setting.defaultValue; }); return defaults;
    }
    function escapeLuaString(str) {
        if (typeof str !== 'string') return String(str); return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    }
    function downloadLuaFile(content, fileName) {
        const a = document.createElement('a'); const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
        a.href = URL.createObjectURL(file); a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    }

    init();
});