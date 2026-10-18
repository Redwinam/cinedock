#!/usr/bin/env python3
"""Build the small native icon pack without a Gradle or Android Studio dependency."""
from pathlib import Path
import os, shutil, subprocess, zipfile, urllib.request, hashlib, secrets, json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CHAIN = Path(os.environ.get('CINEDOCK_TOOLCHAIN', ROOT / '.toolchain'))
JAVA_HOME = Path(os.environ.get('CINEDOCK_JAVA_HOME') or os.environ.get('JAVA_HOME')
                 or '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home')
if not (JAVA_HOME / 'bin/java').exists():
    JAVA_HOME = Path(os.environ.get('JAVA_HOME', ''))
JAVA = str(JAVA_HOME / 'bin/java') if (JAVA_HOME / 'bin/java').exists() else 'java'
JAVAC = str(JAVA_HOME / 'bin/javac') if (JAVA_HOME / 'bin/javac').exists() else 'javac'
KEYTOOL = str(JAVA_HOME / 'bin/keytool') if (JAVA_HOME / 'bin/keytool').exists() else 'keytool'

PACKAGES = [
    ('build-tools', 'build-tools_r35_macosx.zip', '93ab8ce91230e067b5add4bfa79919c52b27f072'),
    ('platform', 'platform-35_r02.zip', '0bb560a90a7a2cbd0dd8348224d518b638fe7949'),
]

def run(args):
    subprocess.run([str(a) for a in args], check=True, cwd=ROOT)

def toolchain():
    for folder, filename, checksum in PACKAGES:
        target = CHAIN / folder
        marker = target / ('android-15/aapt2' if folder == 'build-tools' else 'android-35/android.jar')
        if marker.exists():
            continue
        CHAIN.mkdir(parents=True, exist_ok=True)
        archive = CHAIN / filename
        if not archive.exists():
            print('Downloading Android ' + folder, flush=True)
            with urllib.request.urlopen('https://dl.google.com/android/repository/' + filename, timeout=60) as response, archive.open('wb') as output:
                shutil.copyfileobj(response, output)
        if hashlib.sha1(archive.read_bytes()).hexdigest() != checksum:
            raise RuntimeError('SDK archive checksum mismatch: ' + filename)
        with zipfile.ZipFile(archive) as package:
            for member in package.infolist():
                destination = (target / member.filename).resolve()
                if not destination.is_relative_to(target.resolve()):
                    raise RuntimeError('Unsafe SDK archive path')
                package.extract(member, target)
                mode = member.external_attr >> 16
                if mode:
                    destination.chmod(mode & 0o777)
    return CHAIN / 'build-tools/android-15', CHAIN / 'platform/android-35/android.jar'

def signing():
    private = ROOT / '.signing'
    private.mkdir(mode=0o700, exist_ok=True)
    password = private / 'password.txt'
    store = private / 'cinedock.p12'
    if store.exists() and not password.exists():
        raise RuntimeError('Signing password file is missing; restore it instead of replacing the key.')
    if not password.exists():
        descriptor = os.open(password, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as file:
            file.write(secrets.token_urlsafe(36) + '\n')
    if not store.exists():
        run([KEYTOOL, '-genkeypair', '-noprompt', '-keystore', store, '-storetype', 'PKCS12',
             '-storepass:file', password, '-alias', 'cinedock', '-keyalg', 'RSA', '-keysize', '3072',
             '-validity', '10000', '-dname', 'CN=CineDock,OU=Personal TV Icons,O=Personal'])
        store.chmod(0o600)
    return store, password

def main():
    tools, platform = toolchain()
    build = ROOT / 'build'
    if build.exists():
        shutil.rmtree(build)
    for name in ['generated', 'classes', 'dex']:
        (build / name).mkdir(parents=True, exist_ok=True)
    source = ROOT / 'app/src/main'
    run([tools / 'aapt2', 'compile', '--dir', source / 'res', '-o', build / 'resources.zip'])
    run([tools / 'aapt2', 'link', '-I', platform, '--manifest', source / 'AndroidManifest.xml',
         '--java', build / 'generated', '--min-sdk-version', '21', '--target-sdk-version', '35',
         '-0', 'png', '-A', source / 'assets', '-o', build / 'resources.apk', build / 'resources.zip'])
    java_sources = list((source / 'java').rglob('*.java')) + list((build / 'generated').rglob('*.java'))
    run([JAVAC, '-encoding', 'UTF-8', '--release', '8',
         '-classpath', platform, '-d', build / 'classes', *java_sources])
    with zipfile.ZipFile(build / 'classes.jar', 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in (build / 'classes').rglob('*.class'):
            archive.write(file, file.relative_to(build / 'classes'))
    run([JAVA, '-cp', tools / 'lib/d8.jar', 'com.android.tools.r8.D8', '--release', '--lib', platform,
         '--min-api', '21', '--output', build / 'dex', build / 'classes.jar'])
    shutil.copyfile(build / 'resources.apk', build / 'unsigned.apk')
    with zipfile.ZipFile(build / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as archive:
        for file in (build / 'dex').glob('*.dex'):
            archive.write(file, file.name)
    run([tools / 'zipalign', '-f', '-p', '4', build / 'unsigned.apk', build / 'aligned.apk'])
    store, password = signing()
    dist = ROOT / 'dist'; dist.mkdir(exist_ok=True)
    version = ET.parse(source / 'AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName')
    apk = dist / ('CineDock-' + version + '.apk')
    run([JAVA, '-jar', tools / 'lib/apksigner.jar', 'sign', '--ks', store, '--ks-key-alias', 'cinedock',
         '--ks-pass', 'file:' + str(password), '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
         '--v3-signing-enabled', 'true', '--out', apk, build / 'aligned.apk'])
    run([JAVA, '-jar', tools / 'lib/apksigner.jar', 'verify', '--verbose', apk])
    run([tools / 'zipalign', '-c', '-p', '4', apk])
    print('APK ready: ' + str(apk))

if __name__ == '__main__':
    main()
