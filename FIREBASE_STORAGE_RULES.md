Recommended Firebase Storage rules (production-safe):

rules_version = '2';
service firebase.storage {
match /b/{bucket}/o {
// Allow read to authenticated users for their own customer attachments
match /customers/{customerId}/attachments/{fileName} {
allow read: if request.auth != null && (request.auth.token.role == 'admin' || request.auth.uid == resource.metadata.ownerUid || request.auth.token.role == 'staff');
allow write: if request.auth != null && (request.auth.token.role == 'admin' || request.auth.token.role == 'staff');
allow delete: if request.auth != null && request.auth.token.role == 'admin';

      // Enforce size and content type on upload
      allow create: if request.auth != null
        && (request.auth.token.role == 'admin' || request.auth.token.role == 'staff')
        && request.resource.size < 10 * 1024 * 1024
        && (request.resource.contentType.matches('application/pdf')
          || request.resource.contentType.matches('image/.*')
          || request.resource.contentType.matches('application/msword')
          || request.resource.contentType.matches('application/vnd.openxmlformats-officedocument.*')
          || request.resource.contentType.matches('text/plain')
        );
    }

    // Default deny for everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }

}
}

Notes:

- Requires setting custom claims (role) on Firebase Auth users (admin/staff).
- Use `resource.metadata.ownerUid` when writing owner metadata on upload.
- Ensure client sets custom metadata `ownerUid` when uploading files.
