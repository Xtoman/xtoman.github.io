source "https://rubygems.org"

# Jekyll и его зависимости
gem "jekyll", "~> 4.3"

# Плагины Jekyll
group :jekyll_plugins do
  gem "jekyll-paginate", "~> 1.1"
  gem "jekyll-sitemap", "~> 1.4"
  gem "jekyll-redirect-from", "~> 0.16"
  gem "jekyll-seo-tag", "~> 2.8"
end

# Windows и JRuby не включают файлы zoneinfo
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", "~> 1.2"
  gem "tzinfo-data"
end

# Ускоритель для Windows
gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin] 