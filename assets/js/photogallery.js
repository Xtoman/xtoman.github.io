/**
 * Photo Gallery Lightbox
 * Полноэкранный просмотр фотографий с навигацией
 */

(function() {
    'use strict';
    
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');
    const gallery = document.getElementById('photo-gallery');
    
    if (!lightbox || !gallery) return;
    
    let currentIndex = 0;
    let images = [];
    let captions = [];
    
    // Собираем все изображения из галереи
    function initGallery() {
        const photoItems = gallery.querySelectorAll('.photo-item');
        images = [];
        captions = [];
        
        photoItems.forEach((item, index) => {
            const img = item.querySelector('.gallery-image');
            const caption = item.querySelector('.photo-caption');
            
            if (img) {
                images.push({
                    src: img.getAttribute('data-src') || img.getAttribute('src'),
                    alt: img.getAttribute('alt') || ''
                });
                captions.push(caption ? caption.textContent.trim() : '');
                
                // Добавляем обработчик клика
                img.addEventListener('click', () => openLightbox(index));
            }
        });
    }
    
    // Открытие lightbox
    function openLightbox(index) {
        if (index < 0 || index >= images.length) return;
        
        currentIndex = index;
        updateLightboxImage();
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        
        // Фокус для доступности
        lightboxClose.focus();
    }
    
    // Закрытие lightbox
    function closeLightbox() {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
    
    // Обновление изображения в lightbox
    function updateLightboxImage() {
        if (images[currentIndex]) {
            lightboxImage.src = images[currentIndex].src;
            lightboxImage.alt = images[currentIndex].alt;
            lightboxCaption.textContent = captions[currentIndex] || '';
        }
    }
    
    // Следующее изображение
    function nextImage() {
        currentIndex = (currentIndex + 1) % images.length;
        updateLightboxImage();
    }
    
    // Предыдущее изображение
    function prevImage() {
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        updateLightboxImage();
    }
    
    // Обработчики событий
    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }
    
    if (lightboxPrev) {
        lightboxPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            prevImage();
        });
    }
    
    if (lightboxNext) {
        lightboxNext.addEventListener('click', (e) => {
            e.stopPropagation();
            nextImage();
        });
    }
    
    // Закрытие по клику на фон
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        
        switch(e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                prevImage();
                e.preventDefault();
                break;
            case 'ArrowRight':
                nextImage();
                e.preventDefault();
                break;
        }
    });
    
    // Инициализация при загрузке страницы
    document.addEventListener('DOMContentLoaded', initGallery);
    
    // Переинициализация при изменении DOM (для динамического контента)
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
            if (images.length === 0) {
                initGallery();
            }
        });
        observer.observe(gallery, { childList: true, subtree: true });
    }
})();

