# Настройка GitHub для автоматической загрузки изменений

Репозиторий настроен и готов к работе с GitHub. Для автоматической загрузки изменений необходимо настроить аутентификацию.

## Вариант 1: Personal Access Token (Рекомендуется)

1. Перейдите на https://github.com/settings/tokens
2. Нажмите "Generate new token" → "Generate new token (classic)"
3. Укажите имя токена (например, "Blog Repo Access")
4. Выберите срок действия (рекомендуется "No expiration" или "90 days")
5. Выберите права доступа:
   - ✅ `repo` (полный доступ к репозиториям)
6. Нажмите "Generate token"
7. Скопируйте токен (он показывается только один раз!)

### Использование токена:

При первом push Git попросит ввести:
- **Username**: ваш GitHub username (Xtoman)
- **Password**: вставьте Personal Access Token (не ваш пароль GitHub!)

После первого успешного ввода токен будет сохранен в macOS Keychain и больше не потребуется.

## Вариант 2: SSH ключ

Если вы предпочитаете использовать SSH:

1. Проверьте, что ваш SSH ключ добавлен в GitHub:
   - Перейдите на https://github.com/settings/keys
   - Если ключа нет, добавьте его:
     ```bash
     cat ~/.ssh/id_rsa.pub
     ```
   - Скопируйте вывод и добавьте как новый SSH ключ на GitHub

2. Переключите remote на SSH:
   ```bash
   git remote set-url origin git@github.com:Xtoman/xtoman.github.io.git
   ```

## Первый push

После настройки аутентификации выполните:

```bash
git push -u origin main
```

## Автоматическая загрузка изменений

После настройки аутентификации все изменения будут автоматически загружаться в GitHub при выполнении:

```bash
git push
```

Или я могу автоматически выполнять push после каждого коммита, если вы укажете это в запросе.

## Проверка настроек

Проверить текущие настройки можно командами:

```bash
# Проверить remote URL
git remote -v

# Проверить настройки credential helper
git config credential.helper

# Проверить статус
git status
```

## GitHub Actions

В репозитории уже настроен GitHub Actions workflow для автоматической сборки и деплоя сайта на GitHub Pages при каждом push в ветку `main`.

