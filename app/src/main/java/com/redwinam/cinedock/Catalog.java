package com.redwinam.cinedock;

import android.content.Context;
import android.content.res.XmlResourceParser;
import org.xmlpull.v1.XmlPullParser;
import java.util.ArrayList;
import java.util.List;

public final class Catalog {
    public static final String[] PREFIXES = {"a", "b", "c", "d", "e", "f", "g", "h"};
    public static final String[] STYLES = {"横向带字", "上下带字", "横版纯图标", "方版纯图标",
        "横向带字 · 光晕", "上下带字 · 光晕", "横向带字 · 光晕印记", "上下带字 · 光晕印记"};
    // The picker offers four layouts (a–d); the two with wordmarks also come over a glow (e, f) or a glow
    // with the brand mark as a watermark (g, h).
    public static final int LAYOUTS = 4;
    public static final String[] BACKDROPS = {"普通", "光晕", "光晕印记"};
    public static boolean decorated(int layout) { return layout < 2; }
    public static int style(int layout, int backdrop) {
        return decorated(layout) && backdrop > 0 ? 2 + 2 * backdrop + layout : layout;
    }
    public static final class Entry {
        public final String key, title, group;
        // Per-style drawable names; a version suffix marks images changed in that release.
        private final String[] names;
        Entry(String key, String title, String group, String[] names) {
            this.key = key; this.title = title; this.group = group; this.names = names;
        }
        public String resourceName(int style) { return names[style]; }
        public int resourceId(Context context, int style) {
            return context.getResources().getIdentifier(resourceName(style), "drawable", context.getPackageName());
        }
    }
    public static List<Entry> load(Context context) {
        ArrayList<Entry> entries = new ArrayList<>();
        try (XmlResourceParser parser = context.getResources().getXml(R.xml.catalog)) {
            while (parser.next() != XmlPullParser.END_DOCUMENT) {
                if (parser.getEventType() == XmlPullParser.START_TAG && "item".equals(parser.getName())) {
                    String[] names = new String[PREFIXES.length];
                    for (int style = 0; style < names.length; style++) names[style] = parser.getAttributeValue(null, PREFIXES[style]);
                    entries.add(new Entry(parser.getAttributeValue(null, "key"),
                        parser.getAttributeValue(null, "title"), parser.getAttributeValue(null, "group"), names));
                }
            }
        } catch (Exception error) { throw new IllegalStateException("无法读取图标目录", error); }
        return entries;
    }
    public static int resolveIcon(Context context, String name) {
        for (Entry entry : load(context)) {
            for (int style = 0; style < PREFIXES.length; style++) {
                if (entry.resourceName(style).equals(name)) return entry.resourceId(context, style);
            }
        }
        return 0;
    }
    private Catalog() {}
}
