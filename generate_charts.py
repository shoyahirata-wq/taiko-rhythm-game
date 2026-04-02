"""
譜面自動生成スクリプト
各曲のBPM・ビート位置を音声解析し、実際のリズムに合った譜面JSONを生成する
曲が長い場合は MAX_DURATION 秒でカットする (暇つぶし向け)
"""
import json
import os
import librosa
import numpy as np

MUSIC_DIR = "public/assets/music"
CHARTS_DIR = "charts"
MAX_DURATION = 90  # 最大プレイ時間 (秒)

SONGS = [
    {"id": "song1", "file": "song1.mp3", "title": "ポップスター☆フィーバー"},
    {"id": "song2", "file": "song2.mp3", "title": "ドキドキドラムロール"},
    {"id": "song3", "file": "song3.mp3", "title": "ナイトパレード"},
]

def analyze_song(filepath):
    """曲を解析してBPM、ビート位置、onset情報を返す"""
    print(f"  Loading: {filepath}")
    y, sr = librosa.load(filepath, sr=22050)
    duration = librosa.get_duration(y=y, sr=sr)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0])
    else:
        tempo = float(tempo)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, onset_envelope=onset_env)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)

    # MAX_DURATION 秒以内にカット
    cut = min(duration, MAX_DURATION)
    beat_times = beat_times[beat_times <= cut]
    onset_times = onset_times[onset_times <= cut]

    print(f"  BPM: {tempo:.1f}, Beats: {len(beat_times)}, Onsets: {len(onset_times)}, Duration: {duration:.1f}s (cut at {cut:.0f}s)")
    return {
        "tempo": tempo,
        "beat_times": beat_times,
        "onset_times": onset_times,
        "duration": cut,
    }

def assign_don_ka(notes, seed=42):
    """ノーツにドン/カッを音楽的に割り当てる"""
    rng = np.random.RandomState(seed)
    result = []
    for i, t in enumerate(notes):
        beat_in_measure = i % 4
        if beat_in_measure == 2:
            ntype = "ka"
        elif beat_in_measure == 0:
            ntype = "don"
        else:
            ntype = "ka" if rng.random() < 0.35 else "don"
        result.append({"time": round(float(t), 3), "type": ntype})
    return result

def generate_easy(analysis):
    """かんたん: 2拍に1ノーツ"""
    beats = analysis["beat_times"]
    selected = beats[::2]
    return assign_don_ka(selected, seed=1)

def generate_normal(analysis):
    """ふつう: 毎拍にノーツ"""
    beats = analysis["beat_times"]
    return assign_don_ka(beats, seed=2)

def generate_hard(analysis):
    """むずかしい: 毎拍 + 8分音符 + onset活用"""
    beats = analysis["beat_times"]
    onsets = analysis["onset_times"]
    tempo = analysis["tempo"]
    eighth = 60.0 / tempo / 2

    all_times = set()
    for bt in beats:
        all_times.add(round(float(bt), 3))
        half = round(float(bt) + eighth, 3)
        if half < analysis["duration"] - 0.5:
            all_times.add(half)

    for ot in onsets:
        ot_r = round(float(ot), 3)
        if all(abs(ot_r - t) > eighth * 0.45 for t in all_times):
            if ot_r < analysis["duration"] - 0.5:
                all_times.add(ot_r)

    sorted_times = sorted(all_times)
    return assign_don_ka(sorted_times, seed=3)

def compute_offset(beat_times):
    if len(beat_times) > 0:
        return round(float(beat_times[0]), 3)
    return 0.0

def main():
    os.makedirs(CHARTS_DIR, exist_ok=True)
    for song in SONGS:
        filepath = os.path.join(MUSIC_DIR, song["file"])
        print(f"\n=== {song['title']} ({song['file']}) ===")
        analysis = analyze_song(filepath)
        offset = compute_offset(analysis["beat_times"])
        for diff, gen_func in [("easy", generate_easy), ("normal", generate_normal), ("hard", generate_hard)]:
            notes = gen_func(analysis)
            chart = {
                "title": song["title"],
                "difficulty": diff,
                "bpm": round(analysis["tempo"], 1),
                "offset": offset,
                "notes": notes,
            }
            outpath = os.path.join(CHARTS_DIR, f"{song['id']}_{diff}.json")
            with open(outpath, "w", encoding="utf-8") as f:
                json.dump(chart, f, ensure_ascii=False, indent=2)
            print(f"  {diff}: {len(notes)} notes -> {outpath}")
    print("\n=== Done ===")

if __name__ == "__main__":
    main()
