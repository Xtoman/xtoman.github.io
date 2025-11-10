source "https://rubygems.org"

# Используем gem github-pages вместо прямого указания Jekyll
gem "github-pages", group: :jekyll_plugins

# Плагины, поддерживаемые GitHub Pages
group :jekyll_plugins do
  gem "jekyll-paginate"
  gem "jekyll-sitemap"
  gem "jekyll-redirect-from"
  gem "jekyll-seo-tag"
end

# Windows и JRuby не включают файлы zoneinfo
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", "~> 1.2"
  gem "tzinfo-data"
end

# Ускоритель для Windows
gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin] 