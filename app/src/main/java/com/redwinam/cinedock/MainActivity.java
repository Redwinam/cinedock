package com.redwinam.cinedock;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.GridView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.List;

public final class MainActivity extends Activity {
    private static final int BG = 0xFF101722, INK = 0xFFF1F5FA, MUTED = 0xFFA8B6C8, ACCENT = 0xFF54D6C6;
    private List<Catalog.Entry> entries;
    private int style;
    private boolean picking;
    private GridView grid;
    private TextView subtitle;
    private final Button[] tabs = new Button[4];

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        String action = getIntent().getAction();
        picking = getCallingActivity() != null || Intent.ACTION_PICK.equals(action)
            || Intent.ACTION_GET_CONTENT.equals(action) || "org.adw.launcher.icons.ACTION_PICK_ICON".equals(action)
            || "com.novalauncher.THEME".equals(action);
        entries = Catalog.load(this);
        style = Math.max(0, Math.min(3, getPreferences(MODE_PRIVATE).getInt("style", 0)));
        if (saved != null) style = saved.getInt("style", style);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        root.setPadding(dp(32), dp(20), dp(32), dp(12));
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout heading = new LinearLayout(this); heading.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("映匣 · CineDock", 27, INK); title.setTypeface(null, Typeface.BOLD);
        heading.addView(title); subtitle = text("", 14, MUTED); heading.addView(subtitle);
        header.addView(heading, new LinearLayout.LayoutParams(0, -2, 1));
        Button help = button("使用指南"); help.setOnClickListener(view -> showGuide());
        help.setId(View.generateViewId());
        header.addView(help, new LinearLayout.LayoutParams(dp(112), dp(48)));
        root.addView(header);
        LinearLayout choices = new LinearLayout(this); choices.setPadding(0, dp(14), 0, dp(12));
        for (int i = 0; i < tabs.length; i++) {
            final int target = i;
            Button tab = button(Catalog.STYLES[i]); tabs[i] = tab;
            tab.setId(View.generateViewId());
            tab.setContentDescription(Catalog.STYLES[i]);
            tab.setOnClickListener(view -> selectStyle(target));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1);
            if (i < 3) lp.rightMargin = dp(12);
            choices.addView(tab, lp);
        }
        root.addView(choices);
        grid = new GridView(this); grid.setNumColumns(4); grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
        grid.setId(View.generateViewId());
        grid.setHorizontalSpacing(dp(14)); grid.setVerticalSpacing(dp(12));
        grid.setPadding(dp(3), dp(3), dp(3), dp(8)); grid.setClipToPadding(false);
        grid.setSelector(shape(0x1554D6C6, ACCENT, 3)); grid.setDrawSelectorOnTop(true);
        grid.setAdapter(new IconsAdapter()); grid.setOnItemClickListener((parent, view, position, id) -> choose(entries.get(position)));
        root.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1));
        TextView footer = text(picking ? "方向键选择 · 确定使用 · 返回取消" : "首次设置：请关闭 Projectivy 图标着色，详见右上角“使用指南”", 13, MUTED);
        footer.setPadding(0, dp(8), 0, 0); root.addView(footer);
        for (int i = 0; i < tabs.length; i++) {
            tabs[i].setNextFocusDownId(grid.getId());
            tabs[i].setNextFocusUpId(help.getId());
            tabs[i].setNextFocusLeftId(tabs[Math.max(0, i - 1)].getId());
            tabs[i].setNextFocusRightId(tabs[Math.min(3, i + 1)].getId());
        }
        help.setNextFocusDownId(tabs[3].getId());
        setContentView(root); refreshTabs();
        tabs[style].post(() -> tabs[style].requestFocusFromTouch());
    }
    @Override protected void onSaveInstanceState(Bundle saved) { saved.putInt("style", style); super.onSaveInstanceState(saved); }
    private void selectStyle(int selected) {
        style = selected; getPreferences(MODE_PRIVATE).edit().putInt("style", style).apply();
        ((BaseAdapter) grid.getAdapter()).notifyDataSetChanged(); grid.setSelection(0); refreshTabs();
    }
    private void refreshTabs() {
        for (int i = 0; i < tabs.length; i++) tabs[i].setSelected(i == style);
        grid.setNextFocusUpId(tabs[style].getId());
        subtitle.setText("19 个入口 · 76 张图标  /  " + Catalog.STYLES[style] + (picking ? " · 选择图标" : ""));
    }
    private void choose(Catalog.Entry entry) {
        int id = entry.resourceId(this, style);
        if (id == 0) { Toast.makeText(this, "这张图标暂不可用", Toast.LENGTH_SHORT).show(); return; }
        if (picking) {
            Uri uri = Uri.parse("content://com.redwinam.cinedock.icons/icon/" + entry.resourceName(style));
            Intent result = new Intent().setDataAndType(uri, "image/png")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            result.setClipData(ClipData.newRawUri(entry.title, uri));
            // Projectivy/Candybar compatibility: this identifies the full-size packaged drawable.
            result.putExtra(Intent.EXTRA_SHORTCUT_ICON_RESOURCE, Intent.ShortcutIconResource.fromContext(this, id));
            // A bounded legacy bitmap keeps older icon pickers below Binder transaction limits.
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 2;
            Bitmap fallback = BitmapFactory.decodeResource(getResources(), id, options);
            result.putExtra("icon", fallback);
            setResult(RESULT_OK, result); finish();
        } else {
            ImageView preview = new ImageView(this); preview.setImageResource(id); preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
            preview.setPadding(dp(20), dp(12), dp(20), dp(12)); preview.setAdjustViewBounds(true);
            AlertDialog dialog = new AlertDialog.Builder(this).setTitle(entry.title + " · " + Catalog.STYLES[style])
                .setView(preview).setMessage("在 Projectivy 长按对应卡片，选择“更改图标 → 从图标包 → 映匣 · CineDock”。")
                .setPositiveButton("知道了", null).create();
            dialog.show(); dialog.getWindow().setLayout(dp(620), dp(420));
        }
    }
    private void showGuide() {
        String message = "首次使用、换电视或重置后：先关闭着色\n"
            + "① Projectivy 设置 → 外观 → 卡片 → 自定义图标着色（Custom icon tint）：在色板选择“×”取消着色，再确定。\n"
            + "② 同页 → 聚焦卡片（Focused card）→ 颜色覆盖模式：选择“无／不覆盖（None）”。\n"
            + "本套图标已含完整背景。额外着色会把标志、文字和背景涂成同一种颜色，看起来像空白；关闭后可恢复原色，已在索尼电视确认。\n\n"
            + "单独换图标\n在 Projectivy Premium 中长按应用或 HDMI 卡片 → 更改图标 → 图标包 → 映匣。PS5、Switch、Xbox、Steam 分别在对应 HDMI 卡片上选择。\n\n"
            + "四种样式\n内置列表直接列出 76 张图片；a / b / c / d 分别是横向带字、上下带字、横版纯图标、方版纯图标。前三种适合横向卡片，方版适合方形卡片。\n\n"
            + "批量应用与更新\n外观 → 卡片 → 图标包中选择映匣，默认使用横向带字。更新后重启 Projectivy；若仍显示旧图，重新选择对应图标。";
        new AlertDialog.Builder(this).setTitle("让电视用上这套图标").setMessage(message)
            .setPositiveButton("关闭", null).setNeutralButton("打开 Projectivy", (d, which) -> {
                Intent launch = getPackageManager().getLaunchIntentForPackage("com.spocky.projengmenu");
                if (launch == null) Toast.makeText(this, "请先安装 Projectivy Launcher", Toast.LENGTH_LONG).show();
                else startActivity(launch);
            }).show();
    }
    private class IconsAdapter extends BaseAdapter {
        @Override public int getCount() { return entries.size(); }
        @Override public Object getItem(int position) { return entries.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public View getView(int position, View convert, ViewGroup parent) {
            LinearLayout tile;
            if (convert instanceof LinearLayout) tile = (LinearLayout) convert;
            else {
                tile = new LinearLayout(MainActivity.this); tile.setOrientation(LinearLayout.VERTICAL);
                tile.setGravity(Gravity.CENTER); tile.setPadding(dp(9), dp(9), dp(9), dp(10));
                tile.setBackground(shape(0xFF182433, 0xFF263547, 1));
                ImageView image = new ImageView(MainActivity.this); image.setScaleType(ImageView.ScaleType.FIT_CENTER);
                tile.addView(image, new LinearLayout.LayoutParams(-1, dp(122)));
                TextView label = text("", 16, INK); label.setGravity(Gravity.CENTER); label.setSingleLine(true);
                label.setEllipsize(TextUtils.TruncateAt.END); label.setPadding(0, dp(8), 0, 0);
                tile.addView(label, new LinearLayout.LayoutParams(-1, -2));
            }
            Catalog.Entry entry = entries.get(position);
            int cellWidth = (getResources().getDisplayMetrics().widthPixels - dp(64 + 42 + 6)) / 4;
            int imageWidth = Math.max(dp(64), cellWidth - dp(18));
            ViewGroup.LayoutParams imageLayout = tile.getChildAt(0).getLayoutParams();
            imageLayout.height = style == 3 ? imageWidth : Math.round(imageWidth * 9f / 16f);
            tile.getChildAt(0).setLayoutParams(imageLayout);
            // Cards ship near their on-screen size; decode them whole so the preview stays smooth.
            ((ImageView) tile.getChildAt(0)).setImageBitmap(BitmapFactory.decodeResource(getResources(), entry.resourceId(MainActivity.this, style)));
            ((TextView) tile.getChildAt(1)).setText(entry.title);
            tile.setContentDescription(entry.title + "，" + Catalog.STYLES[style]);
            return tile;
        }
    }
    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); return view;
    }
    private Button button(String label) {
        Button button = new Button(this); button.setText(label); button.setTextSize(16); button.setAllCaps(false);
        button.setPadding(dp(10), 0, dp(10), 0); button.setMinWidth(0); button.setMinHeight(0);
        button.setTextColor(new ColorStateList(new int[][]{new int[]{android.R.attr.state_focused}, new int[]{}}, new int[]{Color.WHITE, INK}));
        StateListDrawable background = new StateListDrawable();
        background.addState(new int[]{android.R.attr.state_focused}, shape(0xFF35556B, ACCENT, 3));
        background.addState(new int[]{android.R.attr.state_selected}, shape(0xFF23473F, ACCENT, 1));
        background.addState(new int[]{}, shape(0xFF1C2A3B, 0xFF314257, 1));
        button.setBackground(background); return button;
    }
    private GradientDrawable shape(int fill, int stroke, int width) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setColor(fill); drawable.setCornerRadius(dp(12));
        drawable.setStroke(dp(width), stroke); return drawable;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
