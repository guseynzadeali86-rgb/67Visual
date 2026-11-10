# BeeVisual Launcher

Лаунчер Minecraft 1.21.4 (Fabric) в стиле BeeVisual: каталог модов с Modrinth,
визуалы, настройки ОЗУ/Java и автоматическая установка всех зависимостей.

## Запуск из исходников

```bash
cd C:\BeeVisual
npm install
npm start
```

Требуется Node.js 20+.

## Сборка .exe

```bash
npm run dist
```

Готовый установщик появится в папке `dist`.

## Структура

- `main.js` — главный процесс: Modrinth API, Mojang/Fabric, скачивание, запуск игры
- `preload.js` — безопасный мост IPC
- `renderer/index.html` — разметка интерфейса
- `renderer/styles.css` — стили (стекломорфизм, янтарный акцент)
- `renderer/app.js` — логика UI
- `assets/icon.png` — иконка приложения

## Данные и папки

Игра и моды хранятся в `%APPDATA%\BeeVisual\minecraft`:

- `minecraft/mods` — установленные моды
- `minecraft/versions` — клиент и профили Fabric
- `minecraft/libraries` — библиотеки Mojang и Fabric
- `minecraft/assets` — ресурсы и звуки
- `config.json` — ник, ОЗУ, список модов

## Возможности

- Поиск и установка модов Modrinth (только Fabric + 1.21.4) с автозагрузкой зависимостей
- Автоматическое скачивание Java 21 (Temurin JRE), если Java не найдена в системе
- Запуск Minecraft в offline-режиме с оффлайн-UUID
- Живой лог запуска в разделе «Настройки»
