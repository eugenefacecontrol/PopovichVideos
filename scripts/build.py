#!/usr/bin/env python3
import json
import re
from pathlib import Path
from collections import defaultdict
from typing import Union, Optional, List, Dict

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'
OUTPUT_FILE = DATA_DIR / 'catalog.json'


def slugify(value: str) -> str:
    value = (value or '').strip().lower()
    value = re.sub(r'[^\w\s-]', '', value, flags=re.UNICODE)
    value = re.sub(r'[-\s]+', '-', value, flags=re.UNICODE).strip('-')
    return value or 'item'


def normalize_item(item: dict, source_name: str, section: str) -> dict:
    week = item.get('week')
    weekday = item.get('weekday')
    date = item.get('date')
    month = item.get('month')
    date_label = ' '.join(str(x) for x in [weekday, date, month] if x)

    folder = item.get('folder') or 'Тренировки'
    subfolder = item.get('subfolder') or ''
    title = item.get('title') or 'Без названия'
    url = item.get('iframeSrc') or ''

    return {
        'id': slugify(f"{source_name}-{section}-{folder}-{subfolder}-{title}-{url}"),
        'source': source_name,
        'section': section,
        'folder': folder,
        'subfolder': subfolder,
        'week': week,
        'weekday': weekday,
        'date': date,
        'month': month,
        'dateLabel': date_label,
        'dayOrder': item.get('dayOrder'),
        'title': title,
        'type': item.get('type'),
        'time': item.get('time'),
        'iframeSrc': url,
        'mediaType': item.get('media_type') or 'video',
        'tags': item.get('tags') or [],
        'inventory': item.get('inventory') or '',
        'isBonus': bool(item.get('is_bonus')),
        'isLecture': bool(item.get('is_lecture')),
        'complexity': item.get('complexity'),
    }


def parse_json_file(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding='utf-8'))
    items = []
    source_name = path.stem
    for section in ('trainings', 'extras', 'subfolders'):
        for raw in data.get(section, []):
            items.append(normalize_item(raw, source_name, section))
    return items


def month_to_number(month: Optional[str]) -> int:
    """Convert Russian month name to number for sorting"""
    if not month:
        return 999
    month_map = {
        'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
        'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
        'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
    }
    return month_map.get(month.lower(), 999)


def main() -> None:
    all_items: List[Dict] = []
    for path in sorted(DATA_DIR.glob('source-*.json')):
        all_items.extend(parse_json_file(path))

    all_items.sort(key=lambda x: (
        x['type'] or '',
        x['folder'] or '',
        x['subfolder'] or '',
        x['week'] or '',
        month_to_number(x['month']),
        int(x['date']) if x['date'] and str(x['date']).isdigit() else 999,
        x['dayOrder'] if x['dayOrder'] is not None else 999,
        x['title'] or '',
    ))

    folders: Dict[str, Dict] = {}
    for item in all_items:
        folder_name = item['folder'] or 'Без папки'
        if folder_name not in folders:
            folders[folder_name] = {
                'name': folder_name,
                'items': [],
                'subfolders': defaultdict(list),
            }
        if item['subfolder']:
            folders[folder_name]['subfolders'][item['subfolder']].append(item)
        else:
            folders[folder_name]['items'].append(item)

    serializable_folders = []
    for folder_name, folder_data in folders.items():
        serializable_folders.append({
            'name': folder_name,
            'items': folder_data['items'],
            'subfolders': [
                {'name': name, 'items': items}
                for name, items in sorted(folder_data['subfolders'].items(), key=lambda x: x[0])
            ]
        })

    payload = {
        'generatedFrom': [p.name for p in sorted(DATA_DIR.glob('source-*.json'))],
        'totalVideos': len(all_items),
        'folders': sorted(serializable_folders, key=lambda x: x['name']),
        'items': all_items,
    }
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Generated {OUTPUT_FILE} with {len(all_items)} videos')


if __name__ == '__main__':
    main()
