// settingsSchema.js
const settingsSchema = [
    { name: "Title", type: "string", defaultValue: "New Hex", luaName: "Title" },
    { name: "Description", type: "string", defaultValue: "", luaName: "Description" },
    { name: "Cost", type: "number", defaultValue: 0, luaName: "Cost" },
    { name: "visible", type: "boolean", defaultValue: false, luaName: "visible" },
    { name: "Previous Map", type: "boolean", defaultValue: false, luaName: "PreviousMap" },
    { name: "Next Map", type: "boolean", defaultValue: false, luaName: "NextMap" }
    // NextHex здесь не указываем, так как он управляется интерактивно
    // и его структура (массив строк) отличается от простых полей
];

// Функция getDefaultHexProperties в script.js теперь не будет добавлять NextHex по умолчанию.
// Он будет создан в hex.properties, когда первая связь будет добавлена.