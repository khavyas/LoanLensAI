import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../api/client';

// Picks a file and uploads it to an application. `expectedDocType` makes it a
// targeted fix for one required item. Resolves false if the picker was
// cancelled, true once the upload (and server-side verification) finished.
export async function pickAndUploadDocument(applicationId, expectedDocType) {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return false;
  const asset = result.assets[0];

  const form = new FormData();
  if (Platform.OS === 'web') {
    // Some browsers don't populate asset.file — fall back to fetching the blob URI.
    const file = asset.file ?? (await (await fetch(asset.uri)).blob());
    form.append('file', file, asset.name);
  } else {
    form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'image/jpeg' });
  }
  if (expectedDocType) form.append('expectedDocType', expectedDocType);

  await api.uploadDocument(applicationId, form);
  return true;
}
