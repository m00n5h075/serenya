# Backend Engineer - Simplified Data Storage Strategy

**Decision**: Device-only storage with server-side AI processing  

## Understanding ✅

- **Temporary Server Storage**: Files stored temporarily for processing/retry only
- **Server-Side AI**: All Claude/AI processing on server (no mobile AI)
- **No Model Versioning**: Server controls AI models, mobile gets current results
- **Retry Logic**: Server-side retry with temporary file persistence
- **Flutter Client**: Mobile app handles local storage, server handles processing

## Key Questions - ANSWERED ✅

1. **Temporary File Management**: Database or file storage for retry mechanisms?
   - **ANSWER**: File storage (S3 temporary buckets)

2. **Processing API Design**: REST endpoints for Flutter file upload/processing?
   - **ANSWER**: REST endpoints approach approved, unless better proposal suggested

3. **Cleanup Logic**: How to ensure temporary files always get deleted?
   - **ANSWER**: Create trigger to delete all User's temporary data on unmanaged failure

4. **Error Handling**: Processing failure responses to Flutter client?
   - **ANSWER**: Yes - need clarification on specific error response format needed

5. **File Formats**: Supported medical document formats (PDF, images, text)?
   - **ANSWER**: Start with PDF and image formats

## Follow-up Questions - ANSWERED ✅

1. **Error Response Format**: What specific error information should Flutter client receive?
   - **ANSWER**: User-friendly message only, suggest retry of failed action

2. **REST API Alternative**: Any preferred alternative to REST for Flutter mobile?
   - **ANSWER**: Open to Backend Engineer suggestion - consult with CTO and adopt common decision

3. **S3 Bucket Strategy**: Temporary file storage architecture details:
   - **ANSWER**: Compare per-user vs shared folder approaches. Clean files older than 1 hour. Add encryption.

4. **Retry Mechanism Details**: Server-side retry implementation:
   - **ANSWER**: Maximum 3 retries, progressively spaced out, async response to app, retain files until success or terminal failure

## Backend Engineer Next Steps

1. **Consult with CTO** on REST vs GraphQL/WebSocket/gRPC for Flutter mobile optimization
2. **S3 Architecture Analysis**: Compare per-user folders vs shared folder with 1-hour cleanup
3. **Retry Implementation**: Design progressive retry (3 attempts max) with async Flutter responses
4. **Encryption Strategy**: Implement temporary file encryption for PHI protection

---
**Ready for detailed backend architecture discussion**