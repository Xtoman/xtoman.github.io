---
layout: post
lang: en
title: "Building a Modern Blog with Jekyll and Cursor"
date: 2025-03-10
description: "A detailed guide to building a modern blog with Jekyll, GitHub Pages, and Cursor. A breakdown of key features and the advantages of the chosen tech stack."
image: "2025-03-10-creating-blog-with-cursor/preview.jpg"
tags: [Jekyll, GitHub Pages, Cursor, Web Development]
---

In this article, I'll walk through the process of building a modern blog with Jekyll and Cursor. We'll cover all the key features, technical decisions, and advantages of the chosen tech stack.

## Why Jekyll?

Jekyll is a static site generator that turns text files into a polished website. Here are its main advantages:

1. **Simplicity** — no database or complex server infrastructure required
2. **Speed** — static files load as fast as possible
3. **Security** — none of the vulnerabilities typical of dynamic sites
4. **Free hosting** — runs on GitHub Pages
5. **Markdown** — a simple, convenient format for writing content

## Key Blog Features

### 1. Responsive Design

The blog is adapted for all devices:
- Proper display on mobile devices
- Optimized navigation
- Scalable images
- Readable fonts on any screen

### 2. Dark Theme

Support for light and dark themes is implemented:
- Automatic detection of system preferences
- Saving the user's choice
- Smooth transitions between themes
- Optimized color schemes

### 3. Smart Search

Built-in content search:
- Instant search without page reload
- Search by titles and content
- Highlighted results
- Contextual snippets in results

### 4. SEO Optimization

The blog is optimized for search engines:
- Proper heading structure
- Open Graph meta tags for social networks
- Automatic sitemap generation
- Optimized URLs
- Canonical URL support

### 5. Image Optimization

Thoughtful image handling:
- Automatic scaling
- Lazy loading
- Caption support
- Optimized previews for social media

## Technical Implementation

### Project Structure

```
├── _posts/                 # Posts directory
├── _layouts/              # Page templates
├── assets/               # Static files
│   ├── css/            # Styles
│   └── images/        # Images
├── _config.yml         # Jekyll configuration
└── README.md          # Documentation
```

### Build System

Jekyll automatically builds the site from:
- Markdown content files
- HTML page templates
- CSS styles
- Static assets

### Working with Content

Each post is a Markdown file with front matter:

```yaml
---
layout: post
title: "Post Title"
date: YYYY-MM-DD
author: "Author Name"
description: "Description for SEO"
image: "path/to/preview.jpg"
tags: [tag1, tag2]
---
```

## Advantages of the Chosen Approach

1. **Development Speed**
   - Rapid prototyping with Cursor
   - Jekyll's ready-made solutions
   - Simple integration with GitHub Pages

2. **Performance**
   - Static content
   - Optimized assets
   - Fast page loading

3. **Scalability**
   - Easy to add new functionality
   - Simple content management
   - Flexible template system

4. **Cost Efficiency**
   - Free hosting
   - Minimal maintenance costs
   - No server required

## Publishing Process

1. Create a new post in Markdown format
2. Add the necessary metadata
3. Commit changes to the repository
4. GitHub Pages automatically builds and publishes the site

## Future Development

The following improvements are planned:
- Comment system
- Social media integration
- Improved tag system
- Automatic table of contents for long posts
- Additional themes

## Recent Blog Improvements

Many improvements have been made recently to enhance usability and improve the user experience:

### 1. Mobile Interface Modernization

- **Compact header**: All controls (search, theme toggle, menu) are placed on one line, aligned to the right.
- **Optimized sizes**: Buttons have an optimal tap size (36px) with smaller icons (20px).
- **Responsive logo**: Long titles are automatically truncated using text-overflow: ellipsis.

### 2. Improved Navigation System

- **Side menu**: The menu slides in from the right on desktops (300px wide) and from top to bottom on mobile (full screen).
- **Smart behavior**: Automatically closes on screen resize, link click, or Escape key press.
- **Scroll lock**: When the menu is open, the main content is locked to prevent accidental scrolling.

### 3. Intelligent Search

- **Adaptive search bar**: Slides in from the left on desktops, expands from the top on mobile.
- **Visual feedback**: Close button, visual focus on activation.
- **High priority**: The search bar always displays above other elements (z-index: 1005).

### 4. Technical Solutions to Complex Problems

- **Element overlap issue**: Resolved with a z-index system (1001 for the header, 1005 for search) so buttons don't overlap appearing elements.
- **Style conflicts**: Duplicate and conflicting media queries were eliminated through logical CSS reorganization.
- **State management**: A dependency system between elements was implemented (closing the menu when search is activated and vice versa).
- **Visual dimming**: When the menu is open, the background is dimmed using a ::after pseudo-element and pointer-events to block interaction.

### 5. Animations and Visual Effects

- **Smooth transitions**: All interactive elements have smooth animations (transform, opacity) with timing-function: ease.
- **Sequential appearance**: Menu items appear one after another with a delay (animation-delay), creating a cascade effect.
- **Feedback**: All buttons have hover and press effects for better visual response.

### 6. Cross-Browser Compatibility

- **Vendor prefixes**: Used where necessary to support older browsers.
- **CSS variables**: Applied for a flexible theme system using [data-theme="dark"].
- **FlexBox**: Used to create responsive layouts instead of outdated positioning methods.

All these improvements were implemented following web development best practices, with a focus on accessibility, performance, and semantic markup.

## Conclusion

Jekyll combined with GitHub Pages and Cursor provides a powerful and flexible toolkit for building modern blogs. This approach offers an excellent balance between functionality, performance, and ease of maintenance.

The entire blog code is open and available on GitHub, so you can use it as a foundation for your own projects or for learning modern web technologies.
