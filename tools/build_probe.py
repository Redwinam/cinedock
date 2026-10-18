#!/usr/bin/env python3
from pathlib import Path
import zipfile, shutil
import build

ROOT = build.ROOT
tools, platform = build.toolchain()
target = ROOT / 'build/probe'
for name in ['classes', 'dex']:
    (target / name).mkdir(parents=True, exist_ok=True)
build.run([tools / 'aapt2', 'link', '-I', platform, '--manifest', ROOT / 'tests/AndroidManifest.xml', '-o', target / 'resources.apk'])
build.run([build.JAVAC, '-encoding', 'UTF-8', '--release', '8', '-classpath', platform,
           '-d', target / 'classes', ROOT / 'tests/ProbeActivity.java'])
with zipfile.ZipFile(target / 'classes.jar', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in (target / 'classes').rglob('*.class'):
        archive.write(file, file.relative_to(target / 'classes'))
build.run([build.JAVA, '-cp', tools / 'lib/d8.jar', 'com.android.tools.r8.D8', '--min-api', '21',
           '--lib', platform, '--output', target / 'dex', target / 'classes.jar'])
shutil.copyfile(target / 'resources.apk', target / 'unsigned.apk')
with zipfile.ZipFile(target / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as archive:
    for file in (target / 'dex').glob('*.dex'):
        archive.write(file, file.name)
build.run([tools / 'zipalign', '-f', '4', target / 'unsigned.apk', target / 'aligned.apk'])
store, password = build.signing()
build.run([build.JAVA, '-jar', tools / 'lib/apksigner.jar', 'sign', '--ks', store, '--ks-key-alias', 'cinedock',
           '--ks-pass', 'file:' + str(password), '--out', target / 'probe.apk', target / 'aligned.apk'])
print(target / 'probe.apk')
