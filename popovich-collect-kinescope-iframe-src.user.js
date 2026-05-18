// ==UserScript==
// @name Popovich - collect kinescope iframe src
// @description Collects Kinescope video URLs from PopovichFit course pages (Alt+C)
// @namespace http://tampermonkey.net/
// @version 2026-03-04v3
// @match https://lk.popovichfit.ru/products/*
// @require https://jolly-newton-babd42.netlify.app/UsefulScripts.js
// @grant none
// ==/UserScript==

/* global xpathToArray */

(function () {
  'use strict';

  const STORAGE_KEY = 'popovich_collector';

  function getState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
    catch { return null; }
  }

  function setState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getPageData() {
    const appEl = document.querySelector('#app');
    if (!appEl || !appEl.dataset.page) return null;
    return JSON.parse(appEl.dataset.page);
  }

  // ─── Collect workouts from Тренировки (weeks) ───
  function collectWeekWorkouts(pageData) {
    const results = [];
    const product = pageData.props.product;
    if (!product?.courses?.length) return results;

    const course = product.courses[0];
    const sectionNames = course.section_names || [];
    const chapters = course.chapters || [];

    for (let w = 0; w < chapters.length; w++) {
      const weekName = sectionNames[w] || `Week ${w + 1}`;
      const days = Array.isArray(chapters[w]) ? chapters[w] : Object.values(chapters[w]);

      for (const day of days) {
        for (const workout of (day.workouts || [])) {
          results.push({
            week: weekName,
            weekday: day.weekday,
            date: day.date,
            month: day.month,
            dayOrder: day.dayOrder,
            title: workout.name,
            type: workout.type,
            time: workout.time,
            iframeSrc: workout.media_url || null,
            media_type: workout.media_type,
            tags: workout.tags,
            inventory: workout.inventory,
            is_bonus: workout.is_bonus
          });
        }
      }
    }
    return results;
  }

  // ─── Collect workouts from Доп. материалы (folders with direct workouts) ───
  function collectFolderWorkouts(pageData) {
    const results = [];
    const folders = pageData.props.folders || [];

    for (const folder of folders) {
      if (folder.workouts && folder.workouts.length > 0) {
        for (const workout of folder.workouts) {
          results.push({
            folder: folder.name,
            title: workout.name,
            type: workout.type || null,
            time: workout.time,
            iframeSrc: workout.media_url || null,
            media_type: workout.media_type,
            tags: workout.tags || null,
            inventory: workout.inventory || null,
            is_lecture: workout.is_lecture || false,
            complexity: workout.complexity || null
          });
        }
      }
    }
    return results;
  }

  // ─── Get list of sub-folder URLs that need fetching ───
  function getSubFolderUrls(pageData) {
    const urls = [];
    const folders = pageData.props.folders || [];
    const productId = pageData.props.product?.id;

    for (const folder of folders) {
      if (folder.children && folder.children.length > 0 && (!folder.workouts || folder.workouts.length === 0)) {
        for (const child of folder.children) {
          urls.push({
            url: `/products/${productId}/folders/${child.slug}`,
            parentFolder: folder.name,
            childFolder: child.name
          });
        }
      }
    }
    return urls;
  }

  // ─── Collect workouts from a folder sub-page ───
  function collectFromFolderPage(pageData, parentFolder, childFolder) {
    const results = [];
    const folder = pageData.props.folder;
    if (!folder?.workouts) return results;

    for (const workout of folder.workouts) {
      results.push({
        folder: parentFolder,
        subfolder: childFolder,
        title: workout.name,
        type: workout.type || null,
        time: workout.time,
        iframeSrc: workout.media_url || null,
        media_type: workout.media_type,
        tags: workout.tags || null,
        inventory: workout.inventory || null,
        is_lecture: workout.is_lecture || false,
        complexity: workout.complexity || null
      });
    }
    return results;
  }

  // ─── Format readable text ───
  function formatReadableText(data) {
    const lines = [];

    lines.push('═══════════════════════════════════════');
    lines.push('  POPOVICHFIT — COLLECTED VIDEOS');
    lines.push('═══════════════════════════════════════');
    lines.push('');

    // 1. Тренировки
    lines.push('━━━ ТРЕНИРОВКИ ━━━');
    lines.push(`Total: ${data.trainings.length} workouts`);
    lines.push('');

    let currentWeek = '';
    for (const w of data.trainings) {
      if (w.week !== currentWeek) {
        currentWeek = w.week;
        lines.push(`── ${currentWeek} ──`);
      }
      const tags = w.tags?.length ? ` [${w.tags.join(', ')}]` : '';
      lines.push(`  ${w.weekday || ''} ${w.date || ''} ${w.month || ''} | ${w.title} (${w.time} мин)${tags}`);
      lines.push(`    → ${w.iframeSrc || 'нет видео'}`);
    }
    lines.push('');

    // 2. Доп. материалы
    lines.push('━━━ ДОП. МАТЕРИАЛЫ ━━━');
    lines.push(`Total: ${data.extras.length} workouts`);
    lines.push('');

    let currentFolder = '';
    for (const w of data.extras) {
      if (w.folder !== currentFolder) {
        currentFolder = w.folder;
        lines.push(`── ${currentFolder} ──`);
      }
      lines.push(`  ${w.title} (${w.time || '?'} мин)`);
      lines.push(`    → ${w.iframeSrc || 'нет видео'}`);
    }
    lines.push('');

    // 3. Доп. материалы — подпапки
    lines.push('━━━ ДОП. МАТЕРИАЛЫ (подпапки) ━━━');
    lines.push(`Total: ${data.subfolders.length} workouts`);
    lines.push('');

    let currentParent = '';
    let currentSub = '';
    for (const w of data.subfolders) {
      if (w.folder !== currentParent) {
        currentParent = w.folder;
        lines.push(`── ${currentParent} ──`);
      }
      if (w.subfolder !== currentSub) {
        currentSub = w.subfolder;
        lines.push(`  ┌ ${currentSub}`);
      }
      lines.push(`  │ ${w.title} (${w.time || '?'} мин)`);
      lines.push(`  │   → ${w.iframeSrc || 'нет видео'}`);
    }
    lines.push('');
    lines.push('═══════════════════════════════════════');

    return lines.join('\n');
  }

  // ─── Show results in a modal overlay ───
  function showResultsModal(data, readableText) {
    // Remove existing modal if any
    document.getElementById('popovich-results-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'popovich-results-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#1e1e1e;color:#d4d4d4;border-radius:12px;padding:24px;max-width:900px;width:90%;max-height:85vh;display:flex;flex-direction:column;font-family:monospace;font-size:13px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-shrink:0;';
    header.innerHTML = `
      <div>
        <strong style="font-size:16px;color:#fff;">Collected Videos</strong>
        <span style="color:#888;margin-left:12px;">
          Тренировки: ${data.trainings.length} · Доп: ${data.extras.length} · Подпапки: ${data.subfolders.length}
        </span>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="pv-copy-json" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Copy JSON</button>
        <button id="pv-copy-text" style="padding:6px 14px;background:#16a34a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Copy Text</button>
        <button id="pv-close" style="padding:6px 14px;background:#555;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">✕</button>
      </div>
    `;

    const textarea = document.createElement('textarea');
    textarea.style.cssText = 'flex:1;background:#111;color:#d4d4d4;border:1px solid #333;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;resize:none;white-space:pre;';
    textarea.value = readableText;
    textarea.readOnly = true;

    modal.appendChild(header);
    modal.appendChild(textarea);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const jsonStr = JSON.stringify(data, null, 2);

    document.getElementById('pv-copy-json').addEventListener('click', () => {
      textarea.value = jsonStr;
      textarea.select();
      document.execCommand('copy');
      document.getElementById('pv-copy-json').textContent = '✓ Copied!';
      setTimeout(() => { document.getElementById('pv-copy-json').textContent = 'Copy JSON'; }, 1500);
    });

    document.getElementById('pv-copy-text').addEventListener('click', () => {
      textarea.value = readableText;
      textarea.select();
      document.execCommand('copy');
      document.getElementById('pv-copy-text').textContent = '✓ Copied!';
      setTimeout(() => { document.getElementById('pv-copy-text').textContent = 'Copy Text'; }, 1500);
    });

    document.getElementById('pv-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ─── Finish: build final object & show ───
  function finishCollection(allResults) {
    const data = {
      trainings: allResults.filter(r => r.week),        // has week → Тренировки
      extras: allResults.filter(r => !r.week && !r.subfolder && r.folder),  // folder only → Доп direct
      subfolders: allResults.filter(r => r.subfolder)    // has subfolder → Доп sub-pages
    };

    const readableText = formatReadableText(data);

    console.log('=== RESULTS (JSON) ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('=== RESULTS (TEXT) ===');
    console.log(readableText);

    showResultsModal(data, readableText);
  }

  // ─── Main orchestrator ───
  function startCollection() {
    const pageData = getPageData();
    if (!pageData) { alert('No page data found'); return; }

    const weekResults = collectWeekWorkouts(pageData);
    const folderResults = collectFolderWorkouts(pageData);
    const subFolderUrls = getSubFolderUrls(pageData);

    if (subFolderUrls.length === 0) {
      finishCollection([...weekResults, ...folderResults]);
      return;
    }

    const state = {
      returnUrl: window.location.href,
      collected: [...weekResults, ...folderResults],
      pending: subFolderUrls,
      currentIndex: 0
    };
    setState(state);

    console.log(`Starting: ${weekResults.length} trainings, ${folderResults.length} extras, ${subFolderUrls.length} sub-folders to fetch`);
    alert(`Collecting ${subFolderUrls.length} sub-folders. Page will navigate automatically — don't close the tab!`);

    window.location.href = subFolderUrls[0].url;
  }

  function continueCollection() {
    const state = getState();
    if (!state) return false;

    const pageData = getPageData();
    if (!pageData) {
      console.error('No page data on sub-folder page');
      processNext(state);
      return true;
    }

    const current = state.pending[state.currentIndex];
    const results = collectFromFolderPage(pageData, current.parentFolder, current.childFolder);
    state.collected.push(...results);

    console.log(`Collected ${results.length} from ${current.childFolder} (${state.currentIndex + 1}/${state.pending.length})`);

    processNext(state);
    return true;
  }

  function processNext(state) {
    state.currentIndex++;

    if (state.currentIndex < state.pending.length) {
      setState(state);
      window.location.href = state.pending[state.currentIndex].url;
    } else {
      const results = state.collected;
      const returnUrl = state.returnUrl;
      clearState();
      localStorage.setItem(STORAGE_KEY + '_results', JSON.stringify(results));
      window.location.href = returnUrl;
    }
  }

  // ─── On page load: check for ongoing collection ───
  const state = getState();
  if (state) {
    setTimeout(() => continueCollection(), 500);
    return;
  }

  const storedResults = localStorage.getItem(STORAGE_KEY + '_results');
  if (storedResults) {
    localStorage.removeItem(STORAGE_KEY + '_results');
    setTimeout(() => finishCollection(JSON.parse(storedResults)), 500);
    return;
  }

  // ─── Normal mode: register hotkey ───
  document.addEventListener('keydown', (event) => {
    event.getHelp();

    event.executeAltEvent("C", "Collect all Kinescope video URLs", function () {
      try {
        startCollection();
      } catch (err) {
        console.error(err);
        alert('Failed: ' + err.message);
      }
    });
  });
})();
