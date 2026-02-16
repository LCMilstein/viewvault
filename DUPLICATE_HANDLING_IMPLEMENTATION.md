# Duplicate Handling UI Implementation

## Overview
This document describes the implementation of Task 9: Add duplicate handling UI for copy/move operations.

## Changes Made

### 1. HTML Changes (static/index.html)
Added a new modal for duplicate warnings:
- **Duplicate Warning Modal**: A modal that appears when a duplicate item is detected
  - Dynamic title and subtitle based on operation type
  - Dynamic content explaining the situation
  - Dynamic buttons based on operation type (copy vs move)

### 2. JavaScript Changes (static/app.js)

#### New Functions Added:

1. **`checkForDuplicate(itemId, itemType, targetListId)`**
   - Checks if an item already exists in the target list
   - Fetches target list items and compares item_id and item_type
   - Returns true if duplicate found, false otherwise

2. **`showDuplicateWarning(operation, itemId, itemType, sourceListId, targetListId)`**
   - Displays the duplicate warning modal
   - Customizes content based on operation type:
     - **Copy**: Shows "Skip Duplicate" button
     - **Move**: Shows "Remove from Source Only" button
   - Both operations have a "Cancel" button

3. **`closeDuplicateWarning()`**
   - Closes the duplicate warning modal

4. **`proceedWithCopy(itemId, itemType, sourceListId, targetListId)`**
   - Handles user choosing to proceed with copy despite duplicate
   - Calls executeCopyOperation with skipDuplicateCheck=true
   - Closes both warning and list selector modals

5. **`proceedWithMove(itemId, itemType, sourceListId, targetListId)`**
   - Handles user choosing to remove from source only
   - Calls executeMoveOperation with skipDuplicateCheck=true
   - Closes both warning and list selector modals

#### Modified Functions:

1. **`executeCopyOperation()`**
   - Added `skipDuplicateCheck` parameter (default: false)
   - Checks for duplicates before executing operation
   - Shows duplicate warning modal if duplicate found
   - Improved success messages to indicate duplicates skipped

2. **`executeMoveOperation()`**
   - Added `skipDuplicateCheck` parameter (default: false)
   - Checks for duplicates before executing operation
   - Shows duplicate warning modal if duplicate found
   - Improved success messages to indicate duplicates removed from source

## User Flow

### Copy Operation with Duplicate:
1. User selects "Copy to List" from item menu
2. User selects target list
3. System checks for duplicate
4. If duplicate found:
   - Duplicate warning modal appears
   - User sees: "This item is already in [Target List Name]"
   - User options:
     - **Cancel**: Abort the operation
     - **Skip Duplicate**: Proceed anyway (backend will skip the duplicate)
5. If user proceeds, operation executes and shows success message

### Move Operation with Duplicate:
1. User selects "Move to List" from item menu
2. User selects target list
3. System checks for duplicate
4. If duplicate found:
   - Duplicate warning modal appears
   - User sees: "This item is already in [Target List Name]"
   - User options:
     - **Cancel**: Abort the operation
     - **Remove from Source Only**: Remove item from source list only
5. If user proceeds, operation executes and shows success message

## Requirements Satisfied

✅ **6.1**: Detect duplicate response (HTTP 409 or duplicate flag in response)
   - Implemented via `checkForDuplicate()` function that queries target list

✅ **6.2**: Show warning modal when duplicate is detected during copy operation
   - Implemented via `showDuplicateWarning()` with copy-specific content

✅ **6.3**: Show warning modal with "Remove from source" option when duplicate detected during move
   - Implemented via `showDuplicateWarning()` with move-specific content and button

✅ **6.4**: Implement "Proceed Anyway" option for copy (skip duplicate)
   - Implemented via "Skip Duplicate" button calling `proceedWithCopy()`

✅ **6.4**: Implement "Remove from Source Only" option for move
   - Implemented via "Remove from Source Only" button calling `proceedWithMove()`

✅ **6.4**: Implement "Cancel" option to abort operation
   - Implemented via "Cancel" button in both copy and move scenarios

✅ **6.4**: Update success message to indicate if duplicates were skipped
   - Enhanced success messages in both operations to show duplicate counts

## Technical Details

### Duplicate Detection
- Uses existing `/api/lists/{list_id}/items` endpoint to fetch target list items
- Compares `item_id` and `item_type` to detect duplicates
- Runs before the actual copy/move operation to provide proactive warning

### Modal Design
- Consistent with existing modal patterns in the application
- Uses same styling and structure as other modals
- Responsive and accessible

### Error Handling
- Gracefully handles API errors during duplicate check
- Falls back to allowing operation if duplicate check fails
- Maintains existing error handling for copy/move operations

## Testing Recommendations

### Manual Testing:
1. **Copy with duplicate**:
   - Add item to List A
   - Add same item to List B
   - Try to copy item from List A to List B
   - Verify warning modal appears
   - Test "Cancel" button
   - Test "Skip Duplicate" button

2. **Move with duplicate**:
   - Add item to List A
   - Add same item to List B
   - Try to move item from List A to List B
   - Verify warning modal appears with different message
   - Test "Cancel" button
   - Test "Remove from Source Only" button

3. **Copy/Move without duplicate**:
   - Verify normal flow works without showing warning modal

4. **Collections and Series**:
   - Test with collections (multiple movies)
   - Test with series (series + episodes)
   - Verify duplicate detection works for expanded items

## Notes

- The implementation is proactive: it checks for duplicates BEFORE executing the operation
- This provides better UX than showing an error after the operation fails
- The backend still handles duplicates gracefully as a fallback
- Success messages now clearly indicate when duplicates were skipped
