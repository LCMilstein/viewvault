# Quick Accessibility Testing Guide

## Application is Running! 🎉

Your ViewVault application is now running locally in Docker at:

**URL:** http://localhost:8008

## Quick Test Checklist

### 1. Basic Keyboard Navigation Test (5 minutes)

1. **Open the application** in your browser: http://localhost:8008
2. **Log in** to your account
3. **Navigate to your watchlist** (should load automatically)

#### Test Item Menu Keyboard Navigation:
- Press **Tab** to navigate to an item's menu button (⋮)
- Press **Enter** to open the menu
- Use **Arrow Down/Up** to navigate menu options
- Press **Enter** to select an option
- Press **Escape** to close the menu

#### Test List Selector Keyboard Navigation:
- Open an item menu and select "Copy to List" or "Move to List"
- Use **Arrow Down/Up** to navigate through available lists
- Press **Home** to jump to first list
- Press **End** to jump to last list
- Press **Enter** or **Space** to select a list
- Press **Escape** to close the modal

#### Test Bulk Selection:
- Click "Select Items" button (or press Tab to reach it and Enter)
- Click items to select them (or Tab to items and Space to select)
- Press Tab to reach "Copy Selected" or "Move Selected" buttons
- Press Enter to activate

### 2. Focus Indicator Test (2 minutes)

1. **Use Tab key** to navigate through the interface
2. **Verify** that each interactive element shows a clear cyan (#00d4aa) outline when focused
3. **Check** that the focus indicator is visible on:
   - Item menu buttons (⋮)
   - Menu options
   - List selector options
   - Bulk action buttons
   - Select Items button

### 3. Screen Reader Test (10 minutes) - Optional but Recommended

#### On Mac (VoiceOver):
1. Press **Cmd + F5** to enable VoiceOver
2. Navigate to http://localhost:8008
3. Use **Tab** to navigate through the interface
4. Listen for announcements of:
   - Button labels (e.g., "More options for [Movie Title]")
   - Menu options (e.g., "Copy item to another list")
   - List names and item counts
   - Success/error messages
5. Press **Cmd + F5** to disable VoiceOver when done

#### On iOS (VoiceOver):
1. Go to **Settings > Accessibility > VoiceOver** and enable it
2. Open Safari and navigate to http://localhost:8008
3. Swipe right to navigate through elements
4. Double-tap to activate buttons
5. Listen for announcements

### 4. Mobile Touch Test (5 minutes) - If Testing on Mobile

1. Open http://localhost:8008 on your mobile device
2. Verify touch targets are large enough (44x44px minimum)
3. Test long-press on a list item to open the menu
4. Test bulk selection with touch
5. Verify modals are properly sized for mobile

### 5. Color Contrast Test (2 minutes)

1. Open browser DevTools (F12 or Cmd+Option+I)
2. Inspect menu options and verify text is readable
3. Check that focus indicators are clearly visible
4. Verify success/error messages have good contrast

## What to Look For

### ✅ Good Signs:
- Clear focus indicators on all interactive elements
- Keyboard navigation works smoothly without getting stuck
- Screen reader announces all important information
- Touch targets are easy to tap on mobile
- Text is readable with good contrast

### ❌ Issues to Report:
- Focus gets trapped in a component
- Focus indicator is not visible
- Screen reader doesn't announce something important
- Keyboard shortcut doesn't work
- Touch target is too small
- Text is hard to read

## Testing the Accessibility Features

### Feature 1: Item Menu with ARIA Labels
**Location:** Three-dot menu (⋮) next to each item

**Test:**
1. Tab to a menu button
2. Verify screen reader announces: "More options for [Item Name], button, menu"
3. Press Enter to open
4. Verify menu options are announced with their actions

### Feature 2: List Selector Modal
**Location:** Opens when you select "Copy to List" or "Move to List"

**Test:**
1. Open the list selector
2. Verify modal title is announced
3. Navigate with Arrow keys
4. Verify each list option announces: "[Action] [List Name] list with [X] items"
5. Press Escape to close

### Feature 3: Bulk Selection Mode
**Location:** "Select Items" button in the list management section

**Test:**
1. Click "Select Items"
2. Verify announcement: "Bulk selection mode activated"
3. Select multiple items
4. Verify selection count updates are announced
5. Use bulk copy/move
6. Verify operation results are announced

### Feature 4: Focus Management
**Test:**
1. Open item menu - focus should move to first menu option
2. Close menu with Escape - focus should return to menu button
3. Open list selector - focus should move to first list option
4. Close modal - focus should return to trigger element

### Feature 5: ARIA Live Regions
**Test:**
1. Perform a copy operation
2. Verify success message is announced by screen reader
3. Perform an operation that fails (e.g., network error)
4. Verify error message is announced

## Quick Keyboard Reference

| Key | Action |
|-----|--------|
| **Tab** | Navigate forward through interactive elements |
| **Shift + Tab** | Navigate backward |
| **Enter** | Activate button or select option |
| **Space** | Activate button or select option |
| **Escape** | Close menu or modal |
| **Arrow Down** | Move to next menu/list option |
| **Arrow Up** | Move to previous menu/list option |
| **Home** | Jump to first list option |
| **End** | Jump to last list option |

## Browser Testing

Test in multiple browsers to ensure consistency:
- ✅ Chrome (primary)
- ✅ Firefox
- ✅ Safari (especially for VoiceOver testing)
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

## Stopping the Application

When you're done testing, stop the Docker container:

```bash
docker-compose down
```

Or use the Docker Desktop interface to stop the container.

## Reporting Issues

If you find any accessibility issues:

1. Note which browser/device you're using
2. Describe what you expected vs. what happened
3. Include steps to reproduce
4. Take a screenshot or screen recording if possible

## Need Help?

- Full testing checklist: See `ACCESSIBILITY_TESTING_CHECKLIST.md`
- Implementation details: See `ACCESSIBILITY_IMPLEMENTATION_SUMMARY.md`
- WCAG 2.1 guidelines: https://www.w3.org/WAI/WCAG21/quickref/

## Quick Wins to Test

These are the most impactful accessibility features to test:

1. **Keyboard-only navigation** (no mouse) - Can you complete a copy/move operation?
2. **Focus indicators** - Can you always see where you are?
3. **Screen reader** - Does it announce everything you need to know?
4. **Mobile touch** - Are buttons easy to tap?

Happy testing! 🎉
