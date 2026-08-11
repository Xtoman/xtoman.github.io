---
layout: post
lang: en
title: "How I Trusted My Code to AI, or the Story of One Experiment with Cursor"
date: 2025-03-07
---

Hey friends! Today I'll tell you a fun story about how I decided to try something new in development. You know those moments when you think "what if..."? That's exactly what I had.

## Meet My New "Partner"

So, I decided to build a schedule management app. Normally I wouldn't even take on a task like that — after all, I'm not a programmer. But then I saw an ad for Cursor — a code editor with built-in AI that promised to help even beginners. I decided to take a risk and give it a shot.

## First Steps and First Impressions

We started with me simply describing in words what I wanted: "Make a simple schedule management app." Cursor suggested using React and some Material-UI (honestly, I didn't really understand what that was, but it sounded solid).

```javascript
// My first React component (thanks, Cursor!)
function App() {
  return (
    <div className="app">
      <h1>My Schedule</h1>
      {/* Cursor said there would be a table here */}
    </div>
  );
}
```

## Funny Moments

Talking to the AI turned out to be more interesting than I thought. I just wrote my wishes in plain language: "make the button prettier," "add the ability to save the schedule," "why isn't it working?" — and Cursor patiently offered solutions. Sometimes I had to ask for a simpler explanation of what exactly it was proposing.

## Unexpected Discoveries

You know what's most surprising? Cursor actually helped me build a working app, even though I barely know any code. It:
- Explained in simple terms what each part of the code does
- Offered ready-made solutions for typical tasks
- Fixed my mistakes (and there were plenty!)

## What We Ended Up With

After a few days of experimenting, we had something that actually worked. Here's the main part of the app:

```javascript
import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';

// Honestly, I don't really understand what's going on here,
// but Cursor said it's needed for a nice interface
const theme = createTheme();

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <div className="app">
          <Header />
          <Routes>
            <Route path="/" element={<Schedule />} />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}
```

## What I Learned

- Turns out you can build simple apps even without deep programming knowledge
- AI can be a great helper if you clearly explain what you want
- There's no need to be afraid of experimenting with new technologies

## Plans for the Future

Now that I have this kind of helper, I'm planning to build a few more simple apps for myself. Maybe I'll even start slowly figuring out how it all works under the hood.

P.S.
If you, like me, are far from programming but want to try building something of your own — give Cursor a shot! It's not as scary as it seems. Worst case, you spend a couple of evenings; best case, you create something useful.

*Date: sometime in the age of machine uprising*