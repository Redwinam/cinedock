package com.redwinam.cinedock;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Public, read-only access to the same fixed icon resources listed in the pack. */
public final class IconProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    private int resource(Uri uri) throws FileNotFoundException {
        if (!"com.redwinam.cinedock.icons".equals(uri.getAuthority())
            || uri.getPathSegments().size() != 2 || !"icon".equals(uri.getPathSegments().get(0))) {
            throw new FileNotFoundException("Unknown icon URI");
        }
        int id = Catalog.resolveIcon(getContext(), uri.getLastPathSegment());
        if (id == 0) throw new FileNotFoundException("Icon not in catalog");
        return id;
    }
    private void readOnly(String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Icons are read-only");
    }
    @Override public String getType(Uri uri) { return "image/png"; }
    @Override public AssetFileDescriptor openAssetFile(Uri uri, String mode) throws FileNotFoundException {
        readOnly(mode);
        return getContext().getResources().openRawResourceFd(resource(uri));
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        readOnly(mode);
        final int id = resource(uri);
        try {
            final ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createPipe();
            new Thread(() -> {
                try (InputStream in = getContext().getResources().openRawResource(id);
                     OutputStream out = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
                    byte[] buffer = new byte[8192]; int size;
                    while ((size = in.read(buffer)) != -1) out.write(buffer, 0, size);
                } catch (IOException ignored) { /* Caller may cancel reading. */ }
            }, "CineDock-icon-reader").start();
            return pipe[0];
        } catch (IOException error) { throw new FileNotFoundException(error.getMessage()); }
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        try {
            int id = resource(uri);
            String[] columns = projection == null
                ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor cursor = new MatrixCursor(columns);
            long size;
            try (AssetFileDescriptor file = getContext().getResources().openRawResourceFd(id)) { size = file.getLength(); }
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = uri.getLastPathSegment() + ".png";
                if (OpenableColumns.SIZE.equals(columns[i])) values[i] = size;
            }
            cursor.addRow(values); return cursor;
        } catch (IOException error) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Read-only"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("Read-only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("Read-only"); }
}
