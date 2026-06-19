// ==UserScript==
// @name Aminova Fit - collect training protocol videos
// @description Collects Aminova Fit training protocol months, exercises, notes, article links, and embedded video URLs (Alt+C/Alt+A/Alt+V)
// @namespace http://tampermonkey.net/
// @version 2026-06-19.2
// @author You
// @match https://aminovafit.com/account/*
// @match https://www.aminovafit.com/account/*
// @require https://jolly-newton-babd42.netlify.app/UsefulScripts.js
// @grant none
// ==/UserScript==

/* global xpathToArray */

(function () {
  'use strict';

  const STORAGE_KEY = 'aminova_trainingprotocol_collector';
  const MONTH_SELECT = 'select.trainingprotocol-titem';
  const TRAINING_ROW = '.training1.training-row';
  const ARTICLE_FETCH_DELAY_MS = 250;
  const MONTH_CHANGE_TIMEOUT_MS = 12000;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function textOf(element, options = {}) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    for (const selector of (options.remove || [])) {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
    }
    return normalizeText(clone.textContent);
  }

  function absoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return window.location.protocol + url;
    try { return new URL(url, window.location.href).href; }
    catch { return url; }
  }

  function uniq(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function articleIdFromUrl(url) {
    try { return new URL(url, window.location.href).searchParams.get('article') || null; }
    catch { return null; }
  }

  function getCurrentUserId() {
    try {
      const params = new URL(window.location.href).searchParams;
      if (params.get('user')) return params.get('user');
    } catch {}
    if (window.Rcl?.office_ID) return String(window.Rcl.office_ID);
    if (window.Rcl?.user_ID) return String(window.Rcl.user_ID);
    return null;
  }

  function getMonthOptions() {
    const select = document.querySelector(MONTH_SELECT);
    if (!select) return [];
    return Array.from(select.options).map((option, index) => ({
      index,
      label: normalizeText(option.textContent) || `Month ${index + 1}`,
      value: option.value,
      selected: option.selected
    }));
  }

  function collectRecommendations() {
    return Array.from(document.querySelectorAll('.trainingprotocol-item_wrap')).map((wrap, index) => {
      const title = textOf(wrap.querySelector(':scope > .lk-block_title'), { remove: ['.lk-block_tochki', '.lk-block_rollup'] });
      const subtitle = textOf(wrap.querySelector('.trainingprotocol-item_title'));
      const text = textOf(wrap.querySelector('.trainingprotocol-text'), { remove: ['.trainingprotocol-text_btn'] });
      const image = wrap.querySelector('img')?.src || null;
      return { index: index + 1, title, subtitle, text, image };
    }).filter((item) => item.title || item.subtitle || item.text || item.image);
  }

  function getNote(noteCell) {
    if (!noteCell) return '';
    const hiddenNote = noteCell.querySelector('div[id^="trainingNote"], div[style*="display: none"]');
    if (hiddenNote) return textOf(hiddenNote);
    return textOf(noteCell, { remove: ['a.notePopup'] });
  }

  function getCell(row, suffix) {
    return row.querySelector(`.lk-training_table-${suffix}`);
  }

  function collectCurrentMonth(monthMeta = null) {
    const row = document.querySelector(TRAINING_ROW);
    const trainingBlocks = Array.from(document.querySelectorAll(`${TRAINING_ROW} > .training-item, ${TRAINING_ROW} > div`))
      .filter((block) => block.querySelector('.lk-training_table'));

    const workouts = trainingBlocks.map((block, workoutIndex) => {
      const title = textOf(block.querySelector(':scope > .lk-block_title'), { remove: ['.lk-block_rollup', '.lk-block_tochki'] });
      const intro = textOf(block.querySelector('.lk-training_unwrap p'));
      const trainingData = block.getAttribute('training-data') || null;
      const rows = Array.from(block.querySelectorAll('.lk-training_table tbody tr'));

      const items = rows.map((tr, itemIndex) => {
        const titleCell = getCell(tr, 'title');
        const link = titleCell?.querySelector('a:not(.tp-mobile_link)') || titleCell?.querySelector('a');
        const articleUrl = absoluteUrl(link?.getAttribute('href') || '');

        return {
          index: itemIndex + 1,
          trainingId: tr.getAttribute('training-id') || articleIdFromUrl(articleUrl),
          title: textOf(titleCell, { remove: ['a.tp-mobile_link'] }),
          articleUrl,
          articleId: articleIdFromUrl(articleUrl),
          note: getNote(getCell(tr, 'note')),
          sets: textOf(getCell(tr, 'approach')),
          reps: textOf(getCell(tr, 'repeat')),
          workload: textOf(getCell(tr, 'workload'), { remove: ['.workload-progressbar'] }),
          restBetweenSets: textOf(getCell(tr, 'tbetween')),
          workingWeight: {
            week1: textOf(getCell(tr, 'week1')),
            week2: textOf(getCell(tr, 'week2')),
            week3: textOf(getCell(tr, 'week3')),
            week4: textOf(getCell(tr, 'week4'))
          },
          video: null
        };
      }).filter((item) => item.title || item.articleUrl);

      return {
        index: workoutIndex + 1,
        title: title || `Тренировка №${workoutIndex + 1}`,
        trainingData,
        intro,
        items
      };
    });

    const select = document.querySelector(MONTH_SELECT);
    const selected = select?.selectedOptions?.[0];
    const month = monthMeta || {
      index: select ? select.selectedIndex : 0,
      label: normalizeText(selected?.textContent) || 'Текущий месяц',
      value: selected?.value || null
    };

    return {
      ...month,
      htmlHash: String(row?.innerHTML?.length || 0) + ':' + String(row?.querySelectorAll('tr[training-id], .lk-training_table tbody tr').length || 0),
      workouts
    };
  }

  function getCurrentRowSignature() {
    const row = document.querySelector(TRAINING_ROW);
    if (!row) return '';
    const titles = Array.from(row.querySelectorAll('.training-item > .lk-block_title, .lk-training_table-title a:not(.tp-mobile_link)'))
      .slice(0, 12)
      .map((node) => normalizeText(node.textContent))
      .join('|');
    return `${row.innerHTML.length}:${titles}`;
  }

  async function selectMonth(option) {
    const select = document.querySelector(MONTH_SELECT);
    if (!select) throw new Error('Cannot find select.trainingprotocol-titem');
    if (select.selectedIndex === option.index && select.value === option.value) return;

    const before = getCurrentRowSignature();
    select.selectedIndex = option.index;
    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const started = Date.now();
    while (Date.now() - started < MONTH_CHANGE_TIMEOUT_MS) {
      await sleep(250);
      const current = getCurrentRowSignature();
      if (current && current !== before) {
        await sleep(250);
        return;
      }
    }

    console.warn('Timed out waiting for month change; collecting current DOM anyway', option);
  }

  async function collectAllMonths(onProgress) {
    const options = getMonthOptions();
    if (!options.length) return [collectCurrentMonth()];

    const originalIndex = options.find((option) => option.selected)?.index ?? document.querySelector(MONTH_SELECT).selectedIndex;
    const months = [];

    for (let index = 0; index < options.length; index++) {
      const option = options[index];
      onProgress?.(`Months: ${index + 1}/${options.length} — ${option.label}`, index + 1, options.length);
      await selectMonth(option);
      months.push(collectCurrentMonth(option));
    }

    const original = options[originalIndex];
    if (original) await selectMonth(original);

    return months;
  }

  function extractUrlsFromText(text) {
    return uniq((text.match(/https?:\/\/[^\s"'<>\\)]+/g) || []).map((url) => {
      try { return decodeURIComponent(url); }
      catch { return url; }
    }));
  }

  function classifyVideoUrls(urls) {
    const iframeSrcs = [];
    const mediaUrls = [];
    const directFileUrls = [];

    for (const rawUrl of urls) {
      const url = absoluteUrl(rawUrl);
      if (/iframe\.mediadelivery\.net|playercdn\.cdnvideo\.ru|\/embed\//i.test(url)) iframeSrcs.push(url);
      if (/\.(m3u8|mp4)(?:[/?#]|$)/i.test(url)) mediaUrls.push(url);
      if (/direct_file=/i.test(url)) directFileUrls.push(url);

      try {
        const parsed = new URL(url);
        const source = parsed.searchParams.get('source');
        if (source) mediaUrls.push(decodeURIComponent(source));
      } catch {}
    }

    return {
      iframeSrcs: uniq(iframeSrcs),
      mediaUrls: uniq(mediaUrls),
      directFileUrls: uniq(directFileUrls),
      allUrls: uniq(urls.map(absoluteUrl))
    };
  }

  function getVideoUrls(video) {
    if (!video) return [];
    return uniq([
      ...(video.mediaUrls || []),
      ...(video.iframeSrcs || []),
      ...(video.directFileUrls || [])
    ]);
  }

  function extractVideoInfoFromHtml(html, articleUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = textOf(doc.querySelector('.knowledgelibrary-article_title, h1, .entry-title'));
    const activeArticleIframeUrls = Array.from(doc.querySelectorAll('div.knowledgelibrary-article.active > div > iframe[src], .knowledgelibrary-article.active iframe[src]'))
      .map((iframe) => iframe.getAttribute('src'));
    const iframeUrls = Array.from(doc.querySelectorAll('iframe[src]')).map((iframe) => iframe.getAttribute('src'));
    const videoUrls = Array.from(doc.querySelectorAll('video[src], video source[src], source[src]')).map((node) => node.getAttribute('src'));
    const rawUrls = extractUrlsFromText(html);
    const interestingRawUrls = rawUrls.filter((url) => (
      /iframe\.mediadelivery\.net|playercdn\.cdnvideo\.ru|direct_file=|\.(m3u8|mp4)(?:[/?#]|$)/i.test(url)
    ));

    const classified = classifyVideoUrls([...activeArticleIframeUrls, ...iframeUrls, ...videoUrls, ...interestingRawUrls]);
    return {
      articleUrl,
      articleTitle: title || null,
      extraction: {
        activeArticleIframeCount: activeArticleIframeUrls.length,
        iframeCount: iframeUrls.length,
        videoSourceCount: videoUrls.length,
        rawInterestingUrlCount: interestingRawUrls.length
      },
      ...classified,
      found: Boolean(classified.iframeSrcs.length || classified.mediaUrls.length || classified.directFileUrls.length)
    };
  }

  async function fetchArticleVideoInfo(articleUrl) {
    if (!articleUrl) return null;
    const response = await fetch(articleUrl, {
      credentials: 'include',
      headers: { 'Accept': 'text/html,application/xhtml+xml' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${articleUrl}`);
    const html = await response.text();
    return extractVideoInfoFromHtml(html, articleUrl);
  }

  function getAllItems(data) {
    return data.months.flatMap((month) => (
      month.workouts.flatMap((workout) => (
        workout.items.map((item) => ({ month, workout, item }))
      ))
    ));
  }

  async function enrichWithArticleVideos(data, onProgress) {
    const seen = new Map();
    const items = getAllItems(data).filter(({ item }) => item.articleUrl);

    for (let index = 0; index < items.length; index++) {
      const { item } = items[index];
      onProgress?.(`Video pages: ${index + 1}/${items.length} — ${item.title}`, index + 1, items.length);

      if (seen.has(item.articleUrl)) {
        item.video = seen.get(item.articleUrl);
        continue;
      }

      try {
        const video = await fetchArticleVideoInfo(item.articleUrl);
        item.video = video;
        seen.set(item.articleUrl, video);
      } catch (err) {
        item.video = {
          articleUrl: item.articleUrl,
          found: false,
          error: err.message,
          iframeSrcs: [],
          mediaUrls: [],
          directFileUrls: [],
          allUrls: []
        };
        seen.set(item.articleUrl, item.video);
      }

      await sleep(ARTICLE_FETCH_DELAY_MS);
    }
  }

  function buildData(months, options = {}) {
    const data = {
      schema: 'aminova.trainingprotocol.v2',
      source: {
        pageUrl: window.location.href,
        userId: getCurrentUserId(),
        collectedAt: new Date().toISOString(),
        fetchedArticlePages: Boolean(options.fetchArticlePages)
      },
      recommendations: collectRecommendations(),
      months,
      summary: {}
    };

    const items = getAllItems(data);
    data.flatVideos = items.map(({ month, workout, item }) => ({
      id: [month.value || month.label, workout.index, item.index, item.articleId || item.trainingId].filter(Boolean).join(':'),
      month: month.label,
      monthValue: month.value,
      workout: workout.title,
      workoutIndex: workout.index,
      exerciseIndex: item.index,
      title: item.title,
      articleId: item.articleId,
      sourceArticleUrl: item.articleUrl,
      note: item.note,
      sets: item.sets,
      reps: item.reps,
      workload: item.workload,
      restBetweenSets: item.restBetweenSets,
      workingWeight: item.workingWeight,
      videoUrl: getVideoUrls(item.video)[0] || null,
      videoUrls: getVideoUrls(item.video),
      iframeSrcs: item.video?.iframeSrcs || [],
      mediaUrls: item.video?.mediaUrls || [],
      directFileUrls: item.video?.directFileUrls || [],
      videoFound: item.video?.found ?? null,
      videoError: item.video?.error || null
    }));

    data.summary = {
      months: data.months.length,
      workouts: data.months.reduce((sum, month) => sum + month.workouts.length, 0),
      exercises: items.length,
      exercisesWithNotes: items.filter(({ item }) => item.note).length,
      articleLinks: items.filter(({ item }) => item.articleUrl).length,
      exercisesWithVideoLinks: data.flatVideos.filter((item) => item.videoUrls.length).length,
      exercisesWithVideoEmbeds: data.flatVideos.filter((item) => item.iframeSrcs.length || item.mediaUrls.length || item.directFileUrls.length).length,
      uniqueArticleLinks: new Set(items.map(({ item }) => item.articleUrl).filter(Boolean)).size,
      uniqueVideoLinks: new Set(data.flatVideos.flatMap((item) => item.videoUrls)).size
    };

    return data;
  }

  function formatMarkdown(data) {
    const lines = [];
    lines.push('# Aminova Fit training protocol');
    lines.push('');
    lines.push(`Collected: ${data.source.collectedAt}`);
    lines.push(`Page: ${data.source.pageUrl}`);
    lines.push('');
    lines.push(`Summary: ${data.summary.months} month(s), ${data.summary.workouts} workout(s), ${data.summary.exercises} exercise row(s), ${data.summary.exercisesWithNotes} note(s), ${data.summary.exercisesWithVideoLinks} row(s) with extracted video links.`);
    lines.push('');

    if (data.recommendations.length) {
      lines.push('## Recommendations');
      for (const rec of data.recommendations) {
        lines.push('');
        lines.push(`### ${rec.title || rec.subtitle || 'Recommendation'}`);
        if (rec.subtitle && rec.subtitle !== rec.title) lines.push(`**${rec.subtitle}**`);
        if (rec.text) lines.push(rec.text);
      }
      lines.push('');
    }

    for (const month of data.months) {
      lines.push(`## ${month.label}`);
      if (month.value) lines.push(`Protocol value: \`${month.value}\``);
      lines.push('');

      for (const workout of month.workouts) {
        lines.push(`### ${workout.title}`);
        if (workout.intro) {
          lines.push('');
          lines.push('Intro:');
          lines.push(workout.intro);
        }
        lines.push('');

        for (const item of workout.items) {
          const parts = [
            item.sets ? `${item.sets} sets` : '',
            item.reps ? `${item.reps} reps` : '',
            item.workload ? `load ${item.workload}` : '',
            item.restBetweenSets ? `rest ${item.restBetweenSets}` : ''
          ].filter(Boolean);

          lines.push(`- ${item.index}. ${item.title}${parts.length ? ` — ${parts.join(', ')}` : ''}`);
          if (item.note) lines.push(`  Note: ${item.note}`);

          const urls = getVideoUrls(item.video);
          for (const url of urls) lines.push(`  Video: ${url}`);
          if (!urls.length && item.articleUrl) lines.push(`  Source article: ${item.articleUrl}`);
          if (item.video?.error) lines.push(`  Video fetch error: ${item.video.error}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function formatHtml(data) {
    const sections = data.months.map((month) => `
      <section>
        <h2>${escapeHtml(month.label)}</h2>
        ${month.workouts.map((workout) => `
          <h3>${escapeHtml(workout.title)}</h3>
          ${workout.intro ? `<p class="intro">${escapeHtml(workout.intro)}</p>` : ''}
          <table>
            <thead><tr><th>#</th><th>Exercise</th><th>Note</th><th>Sets</th><th>Reps</th><th>Load</th><th>Rest</th><th>Weights</th><th>Video links</th></tr></thead>
            <tbody>
              ${workout.items.map((item) => {
                const videoUrls = getVideoUrls(item.video);
                return `<tr>
                  <td>${item.index}</td>
                  <td>${escapeHtml(item.title)}</td>
                  <td>${escapeHtml(item.note)}</td>
                  <td>${escapeHtml(item.sets)}</td>
                  <td>${escapeHtml(item.reps)}</td>
                  <td>${escapeHtml(item.workload)}</td>
                  <td>${escapeHtml(item.restBetweenSets)}</td>
                  <td>${escapeHtml(Object.values(item.workingWeight || {}).filter(Boolean).join(' / '))}</td>
                  <td>
                    ${videoUrls.map((url, idx) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">video ${idx + 1}</a>`).join('<br>')}
                    ${!videoUrls.length && item.articleUrl ? `<a href="${escapeHtml(item.articleUrl)}" target="_blank" rel="noopener noreferrer">source article</a>` : ''}
                    ${item.video?.error ? `<br><span class="error">${escapeHtml(item.video.error)}</span>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `).join('')}
      </section>
    `).join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Aminova Fit training protocol</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; padding: 24px; color: #1f2933; }
    h1, h2, h3 { line-height: 1.2; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 28px; font-size: 13px; }
    th, td { border: 1px solid #d8dee4; padding: 7px 8px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    .intro { white-space: pre-line; color: #4b5563; }
    .error { color: #b42318; }
  </style>
</head>
<body>
  <h1>Aminova Fit training protocol</h1>
  <p>Collected: ${escapeHtml(data.source.collectedAt)}<br>Page: ${escapeHtml(data.source.pageUrl)}</p>
  <p>${data.summary.months} month(s), ${data.summary.workouts} workout(s), ${data.summary.exercises} exercise row(s), ${data.summary.exercisesWithNotes} note(s), ${data.summary.exercisesWithVideoLinks} row(s) with video links.</p>
  ${sections}
</body>
</html>`;
  }

  function downloadText(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function showModal(data) {
    document.getElementById('aminova-results-modal')?.remove();

    const json = JSON.stringify(data, null, 2);
    const markdown = formatMarkdown(data);
    const html = formatHtml(data);
    const baseName = `aminova-trainingprotocol-${new Date().toISOString().slice(0, 10)}`;

    const overlay = document.createElement('div');
    overlay.id = 'aminova-results-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#111827;color:#e5e7eb;border-radius:8px;width:min(1120px,96vw);height:min(820px,92vh);display:flex;flex-direction:column;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 24px 80px rgba(0,0,0,.45);';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #374151;';
    header.innerHTML = `
      <div>
        <strong style="font-size:15px;color:#fff;">Aminova Fit protocol</strong>
        <span style="color:#9ca3af;margin-left:10px;">${data.summary.months} months · ${data.summary.workouts} workouts · ${data.summary.exercises} rows · ${data.summary.exercisesWithVideoLinks} video rows</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
        <button data-action="json">JSON</button>
        <button data-action="md">Markdown</button>
        <button data-action="html">HTML</button>
        <button data-action="copy">Copy shown</button>
        <button data-action="download-json">Download JSON</button>
        <button data-action="download-md">Download MD</button>
        <button data-action="download-html">Download HTML</button>
        <button data-action="close">Close</button>
      </div>`;

    header.querySelectorAll('button').forEach((button) => {
      button.style.cssText = 'background:#374151;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:12px system-ui,sans-serif;';
    });

    const textarea = document.createElement('textarea');
    textarea.style.cssText = 'flex:1;min-height:0;background:#030712;color:#d1d5db;border:0;padding:14px 16px;resize:none;white-space:pre;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.45;';
    textarea.value = markdown;
    textarea.readOnly = true;

    header.addEventListener('click', async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'json') textarea.value = json;
      if (action === 'md') textarea.value = markdown;
      if (action === 'html') textarea.value = html;
      if (action === 'copy') {
        await copyText(textarea.value);
        event.target.textContent = 'Copied';
        setTimeout(() => { event.target.textContent = 'Copy shown'; }, 1200);
      }
      if (action === 'download-json') downloadText(`${baseName}.json`, json, 'application/json');
      if (action === 'download-md') downloadText(`${baseName}.md`, markdown, 'text/markdown');
      if (action === 'download-html') downloadText(`${baseName}.html`, html, 'text/html');
      if (action === 'close') overlay.remove();
    });

    modal.appendChild(header);
    modal.appendChild(textarea);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function setProgress(message, current = null, total = null) {
    let box = document.getElementById('aminova-collector-progress');
    if (!box) {
      box = document.createElement('div');
      box.id = 'aminova-collector-progress';
      box.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#111827;color:#fff;z-index:999998;border-radius:8px;padding:12px 14px;font:13px system-ui,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.3);width:min(380px,calc(100vw - 32px));';
      document.body.appendChild(box);
    }

    const safeCurrent = Number.isFinite(Number(current)) ? Number(current) : null;
    const safeTotal = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : null;
    const percent = safeCurrent !== null && safeTotal ? Math.max(0, Math.min(100, Math.round((safeCurrent / safeTotal) * 100))) : null;

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
        <strong style="font-size:13px;">Aminova collector</strong>
        <span style="color:#d1d5db;font-size:12px;">${percent === null ? '' : `${percent}%`}</span>
      </div>
      <div style="color:#f9fafb;line-height:1.35;word-break:break-word;">${escapeHtml(message)}</div>
      ${safeCurrent !== null && safeTotal ? `
        <div style="margin-top:10px;height:7px;background:#374151;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${percent}%;background:#22c55e;border-radius:999px;transition:width .2s ease;"></div>
        </div>
        <div style="margin-top:6px;color:#9ca3af;font-size:12px;">${safeCurrent} / ${safeTotal}</div>
      ` : ''}
    `;
  }

  function clearProgress() {
    document.getElementById('aminova-collector-progress')?.remove();
  }

  async function startCollection(options = {}) {
    if (!document.querySelector(TRAINING_ROW)) {
      alert('Training protocol DOM was not found. Open the Training protocol tab first.');
      return;
    }

    try {
      setProgress(options.allMonths ? 'Collecting all months...' : 'Collecting current month...');
      const months = options.allMonths ? await collectAllMonths(setProgress) : [collectCurrentMonth()];
      const data = buildData(months, options);

      if (options.fetchArticlePages) {
        await enrichWithArticleVideos(data, setProgress);
        data.source.articleFetchFinishedAt = new Date().toISOString();
        const rebuilt = buildData(data.months, options);
        rebuilt.source.articleFetchFinishedAt = data.source.articleFetchFinishedAt;
        clearProgress();
        console.log('Aminova Fit collected protocol', rebuilt);
        showModal(rebuilt);
        return;
      }

      clearProgress();
      console.log('Aminova Fit collected protocol', data);
      showModal(data);
    } catch (err) {
      clearProgress();
      console.error(err);
      alert('Aminova collector failed: ' + err.message);
    }
  }

  document.addEventListener('keydown', (event) => {
    event.getHelp?.();

    event.executeAltEvent?.('C', 'Aminova: collect current visible training protocol month', () => {
      startCollection({ allMonths: false, fetchArticlePages: false });
    });

    event.executeAltEvent?.('A', 'Aminova: collect all training protocol months', () => {
      startCollection({ allMonths: true, fetchArticlePages: false });
    });

    event.executeAltEvent?.('V', 'Aminova: collect all months and fetch article video embeds', () => {
      const ok = confirm('This will fetch every exercise article page to extract iframe/m3u8/mp4 URLs. Continue?');
      if (ok) startCollection({ allMonths: true, fetchArticlePages: true });
    });
  });

  window.AminovaTrainingProtocolCollector = {
    collectCurrent: () => startCollection({ allMonths: false, fetchArticlePages: false }),
    collectAll: () => startCollection({ allMonths: true, fetchArticlePages: false }),
    collectAllWithVideos: () => startCollection({ allMonths: true, fetchArticlePages: true }),
    collectAllMonths,
    buildData,
    collectCurrentMonth,
    collectRecommendations,
    extractVideoInfoFromHtml
  };
})();
