package com.redwinam.cinedock.probe;

import android.app.Activity;
import android.content.Intent;
import android.content.ComponentName;
import android.content.Context;
import android.content.res.Resources;
import android.content.res.XmlResourceParser;
import android.database.Cursor;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

/** Separate-UID smoke probe for real picker/resource-provider interoperability. */
public class ProbeActivity extends Activity {
    private int verified;
    private int manualVerified;
    private void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private void report(JSONObject result) {
        try (FileOutputStream out = openFileOutput("result.json", MODE_PRIVATE)) {
            out.write(result.toString(2).getBytes("UTF-8"));
        } catch (Exception e) { throw new RuntimeException(e); }
        TextView text = new TextView(this); text.setText(result.toString()); setContentView(text);
        Log.i("CineDockProbe", result.toString());
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (saved != null) { verified = saved.getInt("verified"); manualVerified = saved.getInt("manualVerified"); return; }
        deleteFile("result.json");
        try {
            require(!getPackageManager().queryIntentActivities(new Intent("org.adw.launcher.THEMES"), 0).isEmpty(), "Theme discovery failed");
            Resources resources = getPackageManager().getResourcesForApplication("com.redwinam.cinedock");
            int catalog = resources.getIdentifier("catalog", "xml", "com.redwinam.cinedock");
            try (XmlResourceParser parser = resources.getXml(catalog)) {
                while (parser.next() != XmlPullParser.END_DOCUMENT) {
                    if (parser.getEventType() != XmlPullParser.START_TAG || !"item".equals(parser.getName())) continue;
                    String key = parser.getAttributeValue(null, "key");
                    for (String style : new String[]{"a", "b", "c", "d"}) {
                        Uri uri = Uri.parse("content://com.redwinam.cinedock.icons/icon/" + style + "_" + key);
                        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                        try (InputStream in = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(in, null, bounds); }
                        require(bounds.outWidth == ("d".equals(style) ? 512 : 640), "Wrong resource width: " + uri);
                        require(bounds.outHeight == ("d".equals(style) ? 512 : 360), "Wrong resource height: " + uri);
                        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                            require(cursor != null && cursor.moveToFirst(), "No metadata");
                        }
                        verified++;
                    }
                }
            }
            require(verified == 76, "Catalog count differs");
            // Projectivy 4.72's native picker enumerates appfilter (not drawable.xml),
            // deduplicates drawable names and returns a ShortcutIconResource.
            Set<String> manualNames = new HashSet<>();
            int appfilter = resources.getIdentifier("appfilter", "xml", "com.redwinam.cinedock");
            try (XmlResourceParser parser = resources.getXml(appfilter)) {
                while (parser.next() != XmlPullParser.END_DOCUMENT) {
                    if (parser.getEventType() != XmlPullParser.START_TAG || !"item".equals(parser.getName())) continue;
                    String name = parser.getAttributeValue(null, "drawable");
                    if (name == null || name.isEmpty() || !manualNames.add(name)) continue;
                    Intent.ShortcutIconResource selected = new Intent.ShortcutIconResource();
                    selected.packageName = "com.redwinam.cinedock";
                    selected.resourceName = selected.packageName + ":drawable/" + name;
                    Uri stored = new Uri.Builder().scheme("android.resource").authority(selected.packageName)
                        .path(selected.resourceName.split(":")[1]).build();
                    require(stored.getPathSegments().size() == 2, "Invalid stored URI");
                    Context pack = createPackageContext(stored.getAuthority(), 0);
                    int id = pack.getResources().getIdentifier(stored.getPathSegments().get(1),
                        stored.getPathSegments().get(0), stored.getAuthority());
                    require(id != 0, "Stored selection does not resolve: " + name);
                    Drawable drawable = pack.getDrawable(id);
                    require(drawable != null, "Stored selection has no drawable: " + name);
                    Bitmap image = Bitmap.createBitmap(64, 36, Bitmap.Config.ARGB_8888);
                    drawable.setBounds(0, 0, 64, 36); drawable.draw(new Canvas(image));
                    require((image.getPixel(0, 0) >>> 24) == 255, "Image rendered transparent: " + name);
                    boolean varied = false;
                    for (int x = 0; x < 64; x++) for (int y = 0; y < 36; y++)
                        if (image.getPixel(x, y) != image.getPixel(0, 0)) varied = true;
                    require(varied, "Image rendered blank: " + name);
                    image.recycle(); manualVerified++;
                }
            }
            require(manualVerified == 76, "Projectivy's native picker cannot see all 76 images: " + manualVerified);
            try (OutputStream ignored = getContentResolver().openOutputStream(Uri.parse("content://com.redwinam.cinedock.icons/icon/a_bilibili_tv"))) {
                throw new AssertionError("Provider accepted a write");
            } catch (java.io.FileNotFoundException expected) {}
            try (InputStream ignored = getContentResolver().openInputStream(Uri.parse("content://com.redwinam.cinedock.icons/icon/ic_launcher"))) {
                throw new AssertionError("Non-catalog resource is readable");
            } catch (java.io.FileNotFoundException expected) {}
            Intent pick = new Intent("org.adw.launcher.icons.ACTION_PICK_ICON");
            pick.setComponent(new ComponentName("com.redwinam.cinedock", "com.redwinam.cinedock.MainActivity"));
            startActivityForResult(pick, 10);
        } catch (Throwable error) {
            try { report(new JSONObject().put("ok", false).put("error", error.toString()).put("verified", verified)); }
            catch (Exception ignored) { throw new RuntimeException(error); }
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        out.putInt("verified", verified); out.putInt("manualVerified", manualVerified); super.onSaveInstanceState(out);
    }
    @Override protected void onActivityResult(int request, int code, Intent data) {
        super.onActivityResult(request, code, data);
        try {
            if (code == RESULT_CANCELED) { report(new JSONObject().put("ok", true).put("cancelled", true).put("providerIconsVerified", verified).put("projectivyManualIconsVerified", manualVerified)); return; }
            require(code == RESULT_OK && data != null, "Picker did not return success");
            Intent.ShortcutIconResource icon = data.getParcelableExtra(Intent.EXTRA_SHORTCUT_ICON_RESOURCE);
            require(icon != null && "com.redwinam.cinedock".equals(icon.packageName), "Missing full-size icon resource");
            Resources resources = getPackageManager().getResourcesForApplication(icon.packageName);
            int id = resources.getIdentifier(icon.resourceName, null, null);
            require(id != 0, "Returned resource name cannot be resolved");
            BitmapFactory.Options resourceBounds = new BitmapFactory.Options(); resourceBounds.inJustDecodeBounds = true;
            BitmapFactory.decodeResource(resources, id, resourceBounds);
            BitmapFactory.Options uriBounds = new BitmapFactory.Options(); uriBounds.inJustDecodeBounds = true;
            require(data.getData() != null && "image/png".equals(data.getType()), "Missing content URI or MIME type");
            try (InputStream in = getContentResolver().openInputStream(data.getData())) { BitmapFactory.decodeStream(in, null, uriBounds); }
            require(uriBounds.outWidth == resourceBounds.outWidth && uriBounds.outHeight == resourceBounds.outHeight, "Resource and URI disagree");
            require(data.hasExtra("icon"), "Missing legacy picker fallback");
            report(new JSONObject().put("ok", true).put("providerIconsVerified", verified)
                .put("projectivyManualIconsVerified", manualVerified)
                .put("resource", icon.resourceName).put("uri", data.getData()).put("width", uriBounds.outWidth).put("height", uriBounds.outHeight));
        } catch (Throwable error) {
            try { report(new JSONObject().put("ok", false).put("error", error.toString())); }
            catch (Exception ignored) { throw new RuntimeException(error); }
        }
    }
}
