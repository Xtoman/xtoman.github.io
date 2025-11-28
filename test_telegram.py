#!/usr/bin/env python3
"""
Скрипт для тестирования отправки анонсов в Telegram
Можно запустить локально для проверки работы перед настройкой GitHub Actions
"""

import os
import re
import sys
import yaml
import requests
from pathlib import Path

def parse_post_file(post_path):
    """Парсит файл поста и извлекает метаданные"""
    post_file = Path(post_path)
    
    if not post_file.exists():
        print(f"❌ Файл не найден: {post_path}")
        return None
    
    print(f"📝 Чтение поста: {post_file}")
    
    # Читаем файл поста
    content = post_file.read_text(encoding='utf-8')
    
    # Парсим frontmatter
    frontmatter_match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', content, re.DOTALL)
    
    if not frontmatter_match:
        print(f"⚠️  Не удалось распарсить frontmatter в {post_file}")
        return None
    
    frontmatter_str = frontmatter_match.group(1)
    try:
        frontmatter = yaml.safe_load(frontmatter_str)
    except Exception as e:
        print(f"⚠️  Ошибка парсинга YAML: {e}")
        return None
    
    return frontmatter

def send_to_telegram(title, description, date, post_url, bot_token, chat_id):
    """Отправляет сообщение в Telegram"""
    
    # Формируем сообщение
    message = f"✨ <b>Новый пост в блоге!</b>\n\n"
    message += f"📌 <b>{title}</b>\n\n"
    
    if description:
        # Обрезаем описание до 200 символов
        desc_short = description[:200] + "..." if len(description) > 200 else description
        message += f"{desc_short}\n\n"
    
    if date:
        message += f"📅 {date}\n\n"
    
    message += f"🔗 <a href='{post_url}'>Читать далее →</a>"
    
    # Отправляем в Telegram
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        'chat_id': chat_id,
        'text': message,
        'parse_mode': 'HTML',
        'disable_web_page_preview': False
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        
        result = response.json()
        if result.get('ok'):
            print(f"✅ Сообщение успешно отправлено в Telegram!")
            print(f"   Заголовок: {title}")
            return True
        else:
            print(f"❌ Ошибка API Telegram: {result.get('description', 'Неизвестная ошибка')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка отправки в Telegram: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                print(f"   Детали: {error_data}")
            except:
                print(f"   Ответ сервера: {e.response.text}")
        return False

def main():
    print("🧪 Тест отправки анонса в Telegram\n")
    
    # Получаем параметры из переменных окружения или аргументов
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID')
    blog_url = os.environ.get('BLOG_URL', 'https://xtoman.ru')
    
    # Если не заданы через переменные окружения, запрашиваем
    if not bot_token:
        bot_token = input("Введите TELEGRAM_BOT_TOKEN: ").strip()
        if not bot_token:
            print("❌ TELEGRAM_BOT_TOKEN обязателен")
            sys.exit(1)
    
    if not chat_id:
        chat_id = input("Введите TELEGRAM_CHAT_ID (или @username для публичных каналов): ").strip()
        if not chat_id:
            print("❌ TELEGRAM_CHAT_ID обязателен")
            sys.exit(1)
    
    # Получаем путь к посту
    if len(sys.argv) > 1:
        post_path = sys.argv[1]
    else:
        # Используем последний пост по умолчанию
        posts_dir = Path('_posts')
        if posts_dir.exists():
            posts = sorted(posts_dir.glob('*.md'), reverse=True)
            if posts:
                post_path = str(posts[0])
                print(f"📄 Используется последний пост: {post_path}")
            else:
                print("❌ Не найдено постов в папке _posts/")
                sys.exit(1)
        else:
            post_path = input("Введите путь к файлу поста: ").strip()
            if not post_path:
                print("❌ Путь к посту обязателен")
                sys.exit(1)
    
    # Парсим пост
    frontmatter = parse_post_file(post_path)
    if not frontmatter:
        sys.exit(1)
    
    # Извлекаем данные
    title = frontmatter.get('title', 'Без названия')
    description = frontmatter.get('description', '')
    date = frontmatter.get('date', '')
    
    # Формируем URL поста
    post_file = Path(post_path)
    post_name = post_file.stem
    date_match = re.match(r'^(\d{4}-\d{2}-\d{2})-(.+)$', post_name)
    if date_match:
        year, month, day = date_match.group(1).split('-')
        title_slug = date_match.group(2)
        post_url = f"{blog_url}/{year}/{month}/{day}/{title_slug}/"
    else:
        post_url = blog_url
    
    print(f"\n📋 Данные поста:")
    print(f"   Заголовок: {title}")
    print(f"   Дата: {date}")
    print(f"   Описание: {description[:100]}..." if len(description) > 100 else f"   Описание: {description}")
    print(f"   URL: {post_url}\n")
    
    # Отправляем в Telegram
    confirm = input("Отправить анонс в Telegram? (y/n): ").strip().lower()
    if confirm != 'y':
        print("❌ Отправка отменена")
        sys.exit(0)
    
    print("\n📤 Отправка сообщения...")
    success = send_to_telegram(title, description, date, post_url, bot_token, chat_id)
    
    if success:
        print("\n✅ Тест пройден успешно!")
        sys.exit(0)
    else:
        print("\n❌ Тест не пройден. Проверьте настройки.")
        sys.exit(1)

if __name__ == '__main__':
    main()

