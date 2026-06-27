# CRM Features: User Guide

## Table of Contents

1. [Duplicate Entry Detection](#duplicate-entry-detection)
2. [Secure Delete System](#secure-delete-system)
3. [Group Name Field](#group-name-field)
4. [Activity Logs](#activity-logs)

---

## Duplicate Entry Detection

### Purpose

Prevents accidental duplicate record creation by warning users when they try to create a record with the same vehicle number and work type as an existing record.

### How to Use

#### Creating a Record

1. Navigate to **Clients**, **Leads**, or **Customers** section
2. Click **Add** button to create a new record
3. Fill in the form fields:
   - Vehicle Number (MV NO)
   - Work Type
   - Customer Name
   - Other details
4. Click **Save**

#### If Duplicate Found

1. A warning dialog appears: **"Possible Duplicate Found"**
2. The dialog shows existing similar records with details:
   - Vehicle Number
   - Work Type
   - Customer Name
   - Status
   - Created Date
   - Group Name

3. Choose one of two options:
   - **Cancel**: Don't save the new record
   - **Continue Anyway**: Save anyway and note the override

#### Activity Log

- If you click "Continue Anyway", an activity entry is created
- Records that duplicate warning was shown and overridden
- Useful for auditing and understanding duplicate decisions

### Example

- You're entering a vehicle (MV10001) for insurance work
- System finds existing record: MV10001, insurance, ABC Company
- Dialog appears showing the existing record
- You can cancel (if it's truly a duplicate) or continue (if it's a different scenario)

---

## Secure Delete System

### Purpose

Ensures only administrators can delete records and maintains an audit trail of all deletions with reasons.

### User Roles

#### Admin Users

- ✅ Can delete records
- ✅ Delete button is enabled
- ✅ Can specify deletion reason
- ✅ Multi-step verification process

#### Staff Users

- ❌ Cannot delete records
- ✗ Delete button is disabled/grayed out
- 💬 Tooltip shows: "Only administrators can delete records"

### How to Delete (Admin Only)

#### Step 1: Open Delete Dialog

1. Navigate to the record you want to delete
2. Click the **trash icon** in the Actions column
3. The "Delete Record?" dialog appears

#### Step 2: Verify Admin PIN

1. Enter the **Admin PIN** (for demo: 1234)
2. Click **Verify PIN**
3. If incorrect, error message shows

#### Step 3: Select Deletion Reason

1. A dropdown appears with reasons:
   - **Duplicate Entry** - Record is a duplicate
   - **Wrong Customer** - Entered for wrong customer
   - **Testing Data** - Data created for testing
   - **Other** - Different reason
2. Select a reason (required)
3. Click **Continue**

#### Step 4: Confirm Deletion

1. Review the confirmation screen showing:
   - Record name
   - Deletion reason
   - Your username (who's deleting)
   - Warning: "This action cannot be undone"
2. Click **Delete Record** to confirm
3. Or go **Back** to change reason or cancel

### What Happens After Delete

#### Soft Delete (Not Hard Delete)

- Record is marked as deleted in database
- Not permanently removed (can be recovered)
- Contains deletion metadata:
  - Who deleted it (username)
  - When it was deleted (timestamp)
  - Why it was deleted (reason)

#### Hidden from Views

- Deleted records automatically disappear from:
  - Clients list
  - Leads list
  - Records table
- Staff never see deleted records in normal operation

#### Activity Log

- Delete action recorded:
  - "Record deleted"
  - Reason: [selected reason]
  - Deleted By: [admin username]
  - Date/Time: [timestamp]
  - Can be reviewed in activity trail

### Example

1. Admin identifies duplicate record: "MV10001 - ABC Company"
2. Clicks delete button
3. Enters admin PIN: "1234"
4. Selects reason: "Duplicate Entry"
5. Confirms deletion
6. Record disappears from list
7. Activity log shows deletion with reason
8. Record can never be accidentally shown to users

---

## Group Name Field

### Purpose

Organize and group customers/clients by company, business unit, or any grouping criteria.

### Examples of Group Names

- Company names: "ABC Logistics", "Shree Fleet"
- Business units: "Fleet Operations", "Maintenance Division"
- Geographic groups: "North Region", "Western Territory"
- Customer types: "Transport Association", "Rental Company"

### How to Use

#### Creating a Record with Group Name

1. Click **Add** to create new record
2. Fill in form fields
3. Find **GROUP NAME** field
4. Enter group name, e.g.: "ABC Logistics"
5. Fill remaining fields
6. Click **Save**

#### Editing Group Name

1. Find record in table
2. Click **Edit** (pencil icon)
3. Locate **GROUP NAME** field
4. Change the value
5. Click **Save**
6. Field change is logged in activity

#### Searching by Group Name

1. Use the **Search box** at top of table
2. Type group name, e.g.: "ABC Logistics"
3. Results filter to show matching records
4. Works with partial matches

#### Viewing in Table

- **GROUP** column displays group name for each record
- Shows "—" if no group name assigned
- Easy to see which records belong to which group

#### Viewing in Duplicate Dialog

- When duplicate warning appears
- Shows group name of existing record
- Helps identify different branches/units with same vehicle

### Example Workflow

1. Your company represents multiple fleet operators
2. You want to organize them by company
3. Create record for ABC Logistics, set GROUP NAME to "ABC Logistics"
4. Later, create another record for same company, set same GROUP NAME
5. Can search/filter by "ABC Logistics" to see all their records
6. In duplicate dialog, see group helps distinguish records

---

## Activity Logs

### Purpose

Complete audit trail of all important actions for compliance, tracking, and debugging.

### What Gets Logged

#### Duplicate Detection Activities

- "Duplicate warning shown" - When duplicate found
- "Duplicate warning overridden" - When user continues despite warning
- Shows: who confirmed, when, which field

#### Delete Activities

- "Record deleted" - When record is deleted
- Shows: reason, who deleted, when

#### Field Update Activities

- Status changes: "In Progress" → "Completed"
- Assignee changes: Unassigned → "Priya Nair"
- Work type changes: "Insurance" → "Fitness"
- Application changes
- Group name changes

### Activity Log Format

Each entry shows:

- **Actor**: Username who performed action
- **Action**: What was done
- **Field**: Which field was modified (if applicable)
- **Old Value**: Previous value
- **New Value**: New value
- **Timestamp**: When it happened (date and time)

### Viewing Activity Logs

- Records maintain activity log history
- Shows progression of record through lifecycle
- Useful for:
  - Understanding who made changes
  - Tracking record history
  - Compliance/audit requirements
  - Debugging data issues

### Example Activity Trail

```
2026-06-13 10:30:00 - admin - Record deleted - Reason: Duplicate Entry
2026-06-13 10:29:45 - priya - Updated status - "Pending" → "In Progress"
2026-06-13 10:29:20 - priya - Updated assignee - "" → "Priya Nair"
2026-06-13 10:28:50 - admin - Duplicate warning overridden
2026-06-13 10:28:30 - admin - Record created
```

---

## Best Practices

### Duplicate Entry Detection

- ✅ Review the duplicate warning before deciding
- ✅ Click Cancel if it's truly a duplicate
- ✅ Click Continue Anyway only if different scenario
- ✅ Check Group Name to distinguish records

### Secure Delete

- ✅ Only admins should have delete access
- ✅ Always select appropriate deletion reason
- ✅ Review activity log for deletion audit trail
- ✅ Use "Testing Data" reason for test records

### Group Name Organization

- ✅ Use consistent naming conventions
- ✅ Use company/organization names when possible
- ✅ Keep names concise but descriptive
- ✅ Update when organization relationship changes

### Activity Log Review

- ✅ Regularly review for unexpected changes
- ✅ Track deletion reasons
- ✅ Verify duplicates were handled correctly
- ✅ Use for audit compliance

---

## Troubleshooting

### Duplicate Dialog Not Appearing

- Ensure vehicle number AND work type match exactly (case-sensitive)
- Existing record must not be already deleted
- Save must be attempted (not just filled form)

### Delete Button Disabled

- Only admins can delete
- Ask an admin user if you need to delete
- Staff users will see tooltip explaining restriction

### Wrong PIN Error

- Admin PIN for demo is: **1234**
- Check for extra spaces or typos
- Contact system administrator to reset PIN

### Group Name Not Showing

- Only shows if group name was entered
- Shows "—" if field was left empty
- Edit record to add group name

### Activity Log Not Showing

- Activity logs are automatic
- Check after saving changes
- Look for action type and field changed

---

## Demo Credentials

### Available Users

| Username | Password | Role  | Name         |
| -------- | -------- | ----- | ------------ |
| admin    | admin123 | Admin | Office Admin |
| staff    | staff123 | Staff | Front Desk   |
| priya    | priya123 | Staff | Priya Nair   |
| rahul    | rahul123 | Staff | Rahul Verma  |

### Testing Recommendations

- Log in as **admin** to test delete functionality
- Log in as **staff** to verify delete button is disabled
- Use admin account to understand full feature set
- Use staff account to see limited views

---

## Key Takeaways

✅ **Duplicate Detection**

- Prevents data corruption
- Shows context before save
- Maintains audit trail

✅ **Secure Delete**

- Admin-only access
- Reason-based deletion
- Soft delete preserves data
- Complete audit log

✅ **Group Name**

- Organize records
- Easy searching
- Better context

✅ **Activity Logs**

- Full compliance tracking
- Who, what, when
- Recovery options

---

**Last Updated**: 2026-06-13
**Status**: Ready for Production
