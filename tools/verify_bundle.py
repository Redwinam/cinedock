#!/usr/bin/env python3
"""Validate the real exported catalog, mappings, PNG geometry, and APK resources."""
from pathlib import Path
import xml.etree.ElementTree as ET
import struct, zipfile, hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'app/src/main'

def main():
    manifest = ET.parse(SOURCE / 'AndroidManifest.xml').getroot()
    version = manifest.get('{http://schemas.android.com/apk/res/android}versionName')
    assert json.loads((ROOT / 'package.json').read_text())['version'] == version, 'package.json and Manifest versions differ'
    catalog = ET.parse(SOURCE / 'res/xml/catalog.xml').getroot()
    entries = [e.attrib for e in catalog.findall('item')]
    assert len(entries) == 19
    assert len({e['key'] for e in entries}) == 19
    # Changed images are renamed <style>_<key>_v<x_y_z>; the suffix never runs ahead of the release.
    current = tuple(map(int, version.split('.')))
    for e in entries:
        for prefix in 'abcd':
            match = re.fullmatch(prefix + '_' + re.escape(e['key']) + r'(?:_v(\d+)_(\d+)_(\d+))?', e[prefix])
            assert match, e[prefix]
            assert match.group(1) is None or tuple(map(int, match.groups())) <= current, e[prefix]
    wanted = {e[prefix] for prefix in 'abcd' for e in entries}
    listed = [e.attrib['drawable'] for e in ET.parse(SOURCE / 'res/xml/drawable.xml').findall('item')]
    assert len(listed) == 76 and set(listed) == wanted
    packaged = {p.stem for p in (SOURCE / 'res/drawable-nodpi').glob('[abcd]_*.png')}
    assert packaged == wanted, 'Stale or missing card images: ' + ', '.join(sorted(packaged ^ wanted))
    for name in wanted:
        data = (SOURCE / 'res/drawable-nodpi' / (name + '.png')).read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II', data[16:24]) == ((320, 320) if name.startswith('d_') else (400, 225))
        assert data[24:26] == bytes([8, 2]), name  # Opaque RGB, not a padded transparent tile.
    mapping = ET.parse(SOURCE / 'res/xml/appfilter.xml').getroot()
    manual = set()
    automatic = []
    for item in mapping.findall('item'):
        assert item.attrib['drawable'] in wanted
        manual.add(item.attrib['drawable'])
        if 'component' in item.attrib:
            assert item.attrib['drawable'].startswith('a_'), 'Automatic mappings must keep their default style'
            automatic.append(item.attrib['component'])
    # Projectivy 4.72 enumerates appfilter, ignoring drawable.xml for its own picker.
    assert manual == wanted, 'Projectivy manual catalog is incomplete (including styles and HDMI)'
    assert len(automatic) == len(set(automatic)) == 36
    for file in ['drawable.xml', 'appfilter.xml']:
        assert (SOURCE / 'res/xml' / file).read_bytes() == (SOURCE / 'assets' / file).read_bytes()
    assert manifest.findall('uses-permission') == []
    apk = ROOT / 'dist' / ('CineDock-' + version + '.apk')
    with zipfile.ZipFile(apk) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert 'classes.dex' in names and 'resources.arsc' in names
        assert 'assets/appfilter.xml' in names and 'assets/drawable.xml' in names
        for name in wanted:
            resource = 'res/drawable-nodpi-v4/' + name + '.png'
            candidates = [n for n in names if n.startswith('res/drawable') and n.endswith('/' + name + '.png')]
            assert len(candidates) == 1, name
            entry = archive.getinfo(candidates[0])
            assert entry.compress_type == zipfile.ZIP_STORED, 'Provider requires direct raw-resource access'
        assert not any('.signing' in n or n.endswith(('.p12', '.jks', 'password.txt')) for n in names)
    result = {'version': version, 'entries': len(entries), 'icons': len(wanted),
              'projectivy_manual_icons': len(manual), 'automatic_mappings': len(automatic),
              'appfilter_entries': len(mapping.findall('item')),
              'apk_bytes': apk.stat().st_size, 'apk_sha256': hashlib.sha256(apk.read_bytes()).hexdigest()}
    (ROOT / 'dist/verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
