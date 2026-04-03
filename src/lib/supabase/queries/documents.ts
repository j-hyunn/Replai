import { createClient } from '@/lib/supabase/server'

export type DocumentType = 'resume' | 'portfolio' | 'git'

export interface UserDocument {
  id: string
  user_id: string
  type: DocumentType
  file_url: string | null
  file_name: string | null
  parsed_text: string | null
  normalized_text: string | null
  created_at: string
  updated_at: string
}

export interface CreateDocumentInput {
  user_id: string
  type: DocumentType
  file_url: string
  file_name: string
  parsed_text: string
}

/**
 * Returns all documents belonging to the current user.
 */
export async function getUserDocuments(userId: string): Promise<UserDocument[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(
      `Failed to load documents: ${error.message}. Please refresh the page and try again.`
    )
  }

  return data
}

/**
 * Creates a new document record in the database.
 * The file must already be uploaded to Storage before calling this.
 * Storage path must follow {user_id}/{document_id} structure.
 */
export async function createDocument(input: CreateDocumentInput): Promise<UserDocument> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_documents')
    .insert(input)
    .select()
    .single()

  if (error) {
    throw new Error(
      `Failed to save document: ${error.message}. Please try uploading again.`
    )
  }

  return data
}

/**
 * Upserts a git link document (no file storage, URL stored in file_url).
 * Creates a new record if none exists, or updates the existing one.
 */
export async function upsertGitDocument(
  userId: string,
  gitUrl: string
): Promise<UserDocument> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('user_documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'git')
    .single()

  if (existing) {
    const { data, error } = await supabase
      .from('user_documents')
      .update({ file_url: gitUrl, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update git link: ${error.message}. Please try again.`)
    }
    return data
  }

  const { data, error } = await supabase
    .from('user_documents')
    .insert({ user_id: userId, type: 'git', file_url: gitUrl, parsed_text: '' })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to save git link: ${error.message}. Please try again.`)
  }
  return data
}

/**
 * Returns documents matching the given IDs.
 * RLS ensures only the owner's documents are returned.
 */
export async function getDocumentsByIds(ids: string[]): Promise<UserDocument[]> {
  if (ids.length === 0) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_documents')
    .select('*')
    .in('id', ids)

  if (error) {
    throw new Error(
      `Failed to load documents: ${error.message}. Please refresh the page and try again.`
    )
  }

  return data
}

/**
 * Saves the normalized (cleaned) text for a document.
 * Called after upload + parsing. Failure is non-fatal — callers must catch.
 */
export async function updateNormalizedText(
  documentId: string,
  normalizedText: string
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_documents')
    .update({ normalized_text: normalizedText, updated_at: new Date().toISOString() })
    .eq('id', documentId)
  if (error) {
    throw new Error(`Failed to save normalized text: ${error.message}`)
  }
}

/**
 * Deletes a document from both the database and Storage simultaneously.
 * Both operations must succeed — if either fails, an error is thrown.
 *
 * @param documentId - The UUID of the document record in user_documents
 * @param storagePath - The Storage path (e.g., "{user_id}/{document_id}")
 */
export async function deleteDocument(
  documentId: string,
  storagePath: string
): Promise<void> {
  const supabase = await createClient()

  const [dbResult, storageResult] = await Promise.all([
    supabase.from('user_documents').delete().eq('id', documentId),
    supabase.storage.from('documents').remove([storagePath]),
  ])

  if (dbResult.error) {
    throw new Error(
      `Failed to delete document record: ${dbResult.error.message}. Please try again.`
    )
  }

  if (storageResult.error) {
    throw new Error(
      `Failed to delete document file: ${storageResult.error.message}. Please try again.`
    )
  }
}
