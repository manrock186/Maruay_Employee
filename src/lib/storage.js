import { supabase } from '../supabase.js';

// ============ FILE UPLOAD HELPERS ============
// Upload เอกสารแรงงาน (รูป/PDF) ไปยัง Supabase Storage
// Path เก็บแบบ: businessId/docType-timestamp-random.ext
async function uploadDocument(file, businessId, docType) {
  if (!file) return null;
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${businessId || 'misc'}/${docType}-${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from('employee-docs').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) { alert('อัปโหลดไฟล์ไม่สำเร็จ: ' + error.message); return null; }
  return path;
}

// ลบเอกสารเก่าออกจาก storage
async function deleteDocument(path) {
  if (!path) return;
  await supabase.storage.from('employee-docs').remove([path]);
}

// สร้าง signed URL (expire 1 ชั่วโมง) เพื่อดู/download เอกสาร
async function getDocumentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('employee-docs').createSignedUrl(path, 3600);
  if (error) { console.error('signed url error:', error); return null; }
  return data.signedUrl;
}

// ============ IMAGE HELPER ============
const resizeImage = (file, maxSize = 400) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = h * (maxSize / w); w = maxSize; }
      else if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

export {
  uploadDocument,
  deleteDocument,
  getDocumentUrl,
  resizeImage,
};
