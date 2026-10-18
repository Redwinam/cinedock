package com.redwinam.cinedock;

import android.content.Context;
import android.content.res.XmlResourceParser;
import org.xmlpull.v1.XmlPullParser;
import java.util.ArrayList;
import java.util.List;

public final class Catalog {
    public static final String[] PREFIXES = {"a", "b", "c", "d"};
    public static final String[] STYLES = {"横向带字", "上下带字", "横版纯图标", "方版纯图标"};
    public static final class Entry {
        public final String key, title, group;
        Entry(String key, String title, String group) {
            this.key = key; this.title = title; this.group = group;
        }
        public String resourceName(int style) { return PREFIXES[style] + "_" + key; }
        public int resourceId(Context context, int style) {
            return context.getResources().getIdentifier(resourceName(style), "drawable", context.getPackageName());
        }
    }
    public static List<Entry> load(Context context) {
        ArrayList<Entry> entries = new ArrayList<>();
        try (XmlResourceParser parser = context.getResources().getXml(R.xml.catalog)) {
            while (parser.next() != XmlPullParser.END_DOCUMENT) {
                if (parser.getEventType() == XmlPullParser.START_TAG && "item".equals(parser.getName())) {
                    entries.add(new Entry(parser.getAttributeValue(null, "key"),
                        parser.getAttributeValue(null, "title"), parser.getAttributeValue(null, "group")));
                }
            }
        } catch (Exception error) { throw new IllegalStateException("无法读取图标目录", error); }
        return entries;
    }
    public static int resolveIcon(Context context, String name) {
        for (Entry entry : load(context)) {
            for (int style = 0; style < 4; style++) {
                if (entry.resourceName(style).equals(name)) return entry.resourceId(context, style);
            }
        }
        return 0;
    }
    private Catalog() {}
}
