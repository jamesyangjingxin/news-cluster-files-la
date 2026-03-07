// News Cluster App - Standalone Version
// Version 1.9 - With Chart Generation Support

(function(){
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

  function initApp(){
    const API_BASE = "https://news-cluster-7u1x.onrender.com";
    const ANALYSIS_API_BASE = "https://news-analysis-la.onrender.com";
    const DEFAULT_WINDOW_MINUTES = 180;
    const DEFAULT_MIN_COUNT_NOW = 2;

    const root = document.getElementById("newscluster-app");
    if (!root) {
      console.error("Error: <div id='newscluster-app'></div> not found on page!");
      return;
    }

    console.log("News Cluster App: Initializing...");

    root.innerHTML = `
      <div class="nc-wrap">
        <div class="nc-card">
          <div class="nc-title">News Cluster (Stories)</div>

          <div class="nc-row">
            <div class="nc-field">
              <div class="nc-label">Project ID</div>
              <input id="ncProjectId" class="nc-input" placeholder="e.g., 10003" />
            </div>

            <div class="nc-field">
              <div class="nc-label">window_minutes (30–10080)</div>
              <input id="ncWindowMinutes" class="nc-input" type="number" min="30" max="10080" />
              <div class="nc-small">Default 180. Larger window returns more stories.</div>
            </div>

            <div class="nc-field">
              <div class="nc-label">min_count_now</div>
              <select id="ncMinCountNow" class="nc-select">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
              <div class="nc-small">Default 2 filters 1-off noise.</div>
            </div>

            <div class="nc-field" style="flex:0 0 auto;">
              <button id="ncRunBtn" class="nc-btn nc-btn-primary">View current result</button>
            </div>
          </div>

          <div id="ncStatus" class="nc-status"></div>
          <hr class="nc-hr"/>

          <div id="ncSummary"></div>
          <div id="ncResults"></div>
        </div>
      </div>

      <div id="ncOverlay" class="nc-overlay"></div>

      <div id="ncDrawer" class="nc-drawer">
        <div class="nc-drawer-head">
          <div>
            <div id="ncDrawerTitle" class="nc-drawer-title">Story</div>
            <div class="nc-drawer-sub">All news under this story</div>
          </div>
          <button id="ncCloseDrawer" class="nc-x" aria-label="Close">×</button>
        </div>
        <div id="ncDrawerBody" class="nc-drawer-body"></div>
      </div>

      <div id="ncAnalysisModal" class="nc-modal">
        <div class="nc-modal-head">
          <div class="nc-modal-title" id="ncAnalysisModalTitle">Deep Analysis</div>
          <button id="ncCloseAnalysisModal" class="nc-x" aria-label="Close">×</button>
        </div>
        <div class="nc-modal-body">
          <div class="nc-form-group">
            <div class="nc-label">Control Site</div>
            <input id="ncControlSite" class="nc-input" value="fraserinstitute.org" placeholder="e.g., fraserinstitute.org" />
            <div class="nc-small">Website domain for analysis perspective</div>
          </div>

          <div class="nc-form-group">
            <div class="nc-label">Control Article (Optional)</div>
            <input id="ncControlArticle" class="nc-input" placeholder="https://www.example.com/article" />
            <div class="nc-small">Specific article URL for context</div>
          </div>

          <div class="nc-form-group">
            <div class="nc-label">Additional Prompt (Optional)</div>
            <textarea id="ncAdditionalPrompt" class="nc-textarea" placeholder="e.g., business (no more than 2 words)"></textarea>
            <div class="nc-small">Brief guidance for the AI analysis</div>
          </div>

          <div class="nc-form-group">
            <div class="nc-label">Chart Generation (Optional)</div>
            <textarea id="ncChartData" class="nc-textarea" placeholder="Paste CSV or tab-separated data here&#10;Example:&#10;Month,Sales&#10;January,1000&#10;February,1500&#10;March,1200"></textarea>
            <div class="nc-small">Claude will auto-detect chart type (line, bar, pie, etc.)</div>
          </div>

          <div class="nc-form-group">
            <div class="nc-label">Chart Explanation (Optional)</div>
            <input id="ncChartExplanation" class="nc-input" placeholder="e.g., Monthly sales data for Q1 2024" />
            <div class="nc-small">Brief context to help Claude understand the data</div>
          </div>

          <div class="nc-form-group">
            <div class="nc-label">Select AI Tools</div>
            <select id="ncAiTool" class="nc-select">
              <option value="claude">Claude</option>
              <option value="perplexity">Perplexity</option>
            </select>
          </div>

          <div id="ncAnalysisResult"></div>
        </div>
        <div class="nc-modal-footer">
          <button id="ncCancelAnalysis" class="nc-btn">Cancel</button>
          <button id="ncWriteAnalysis" class="nc-btn nc-btn-primary">Write Analysis Now</button>
        </div>
      </div>
    `;

    const el = (id) => document.getElementById(id);

    function fmtISO(iso){
      try{
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toISOString().slice(0,19);
      }catch{ return iso; }
    }

    function escapeHtml(s){
      return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

    async function postJson(url, body){
      const resp = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(data?.error || `${resp.status} ${resp.statusText}`);
      return data;
    }

    function setStatus(msg, isError=false){
      const s = el("ncStatus");
      s.textContent = msg || "";
      s.className = "nc-status" + (isError ? " err" : (msg.includes("✓") || msg.includes("Loaded") ? " success" : ""));
    }

    function computeSourceSummary(topArticles){
      const counts = new Map();
      for (const a of topArticles || []){
        const src = a?.source || "unknown";
        counts.set(src, (counts.get(src) || 0) + 1);
      }
      return [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}(${v})`).join(", ");
    }

    function renderStoryCard(story, idx){
      const sourcesSummary = computeSourceSummary(story.top_articles);
      const topArticlesHtml = (story.top_articles || []).map((a)=>`
        <div class="nc-article">
          <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a>
          <div class="nc-article-time">${escapeHtml(a.source)} · ${escapeHtml(fmtISO(a.published_at))}</div>
          ${a.snippet ? `<div class="nc-article-snippet">Snippet: ${escapeHtml(a.snippet)}</div>` : ``}
        </div>
      `).join("");

      const articleCount = story.article_count ?? (story.article_ids?.length || 0);

      return `
        <div class="nc-story">
          <div class="nc-story-header">
            <div style="flex:1;">
              <div class="nc-story-title">
                <a href="#" class="nc-open" data-idx="${idx}">${escapeHtml(story.story_title || "")}</a>
              </div>
              <div class="nc-story-meta">
                ${sourcesSummary ? `${escapeHtml(sourcesSummary)}<br/>` : ""}
                Articles: ${articleCount} · Confidence: ${story.confidence ?? 0}
              </div>
            </div>
            <button class="nc-btn nc-btn-primary nc-deep-analysis" data-idx="${idx}" style="flex-shrink:0;">
              Deep analysis
            </button>
          </div>

          <div class="nc-articles">
            <strong>Top articles</strong>
            ${topArticlesHtml || `<div class="nc-empty">No top articles.</div>`}
          </div>

          <div class="nc-footer-link">
            <a href="#" class="nc-open" data-idx="${idx}">
              Click to view all ${articleCount} articles in this window →
            </a>
          </div>
        </div>
      `;
    }

    let lastPayload = null;
    let currentStoryForAnalysis = null;

    async function openStoryDrawer(idx){
      const story = lastPayload?.stories?.[idx];
      if (!story) return;

      el("ncDrawerTitle").textContent = story.story_title || "Story";
      el("ncDrawerBody").innerHTML = `<div class="nc-empty">Loading articles…</div>`;
      el("ncDrawer").classList.add("open");
      el("ncOverlay").classList.add("open");

      try{
        const url = `${API_BASE}/api/projects/${encodeURIComponent(lastPayload.project_id)}/story_articles`;
        const resp = await postJson(url, { article_ids: story.article_ids || [] });

        const list = resp.articles || [];
        el("ncDrawerBody").innerHTML = list.length ? list.map((a)=>`
          <div class="nc-article">
            <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a>
            <div class="nc-article-time">${escapeHtml(a.source)} · ${escapeHtml(fmtISO(a.published_at))}</div>
            ${a.snippet ? `<div class="nc-article-snippet">Snippet: ${escapeHtml(a.snippet)}</div>` : ``}
          </div>
        `).join("") : `<div class="nc-empty">No articles found.</div>`;
      }catch(err){
        el("ncDrawerBody").innerHTML = `<div class="nc-empty" style="border-color:#fecaca;background:#fef2f2;color:#991b1b;">Error: ${escapeHtml(err.message || String(err))}</div>`;
      }
    }

    function closeDrawer(){
      el("ncDrawer").classList.remove("open");
      el("ncOverlay").classList.remove("open");
    }

    async function openAnalysisModal(idx){
      const story = lastPayload?.stories?.[idx];
      if (!story) return;

      currentStoryForAnalysis = story;

      el("ncAnalysisModalTitle").textContent = story.story_title || "Deep Analysis";
      el("ncAnalysisResult").innerHTML = "";
      el("ncAnalysisModal").classList.add("open");
      el("ncOverlay").classList.add("open");

      el("ncControlSite").value = "fraserinstitute.org";
      el("ncControlArticle").value = "";
      el("ncAdditionalPrompt").value = "";
      el("ncChartData").value = "";
      el("ncChartExplanation").value = "";
      el("ncAiTool").value = "claude";
    }

    function closeAnalysisModal(){
      el("ncAnalysisModal").classList.remove("open");
      el("ncOverlay").classList.remove("open");
      currentStoryForAnalysis = null;
    }

    async function writeAnalysis(){
      if (!currentStoryForAnalysis) return;

      const controlSite = el("ncControlSite").value.trim();
      const controlArticle = el("ncControlArticle").value.trim();
      const additionalPrompt = el("ncAdditionalPrompt").value.trim();
      const chartData = el("ncChartData").value.trim();
      const chartExplanation = el("ncChartExplanation").value.trim();
      const aiTool = el("ncAiTool").value;

      if (!controlSite){
        alert("Please enter a Control Site");
        return;
      }

      const writeBtn = el("ncWriteAnalysis");
      const cancelBtn = el("ncCancelAnalysis");
      writeBtn.disabled = true;
      cancelBtn.disabled = true;
      writeBtn.innerHTML = '<span class="nc-loading">⟳</span> Generating...';

      const statusMsg = chartData 
        ? `🔄 Generating deep analysis with chart... This may take 60-90 seconds.`
        : `🔄 Generating deep analysis... This may take 30-60 seconds.`;
      
      el("ncAnalysisResult").innerHTML = `<div class="nc-empty">${statusMsg}</div>`;

      try{
        const storyArticlesUrl = `${API_BASE}/api/projects/${encodeURIComponent(lastPayload.project_id)}/story_articles`;
        const storyResp = await postJson(storyArticlesUrl, { article_ids: currentStoryForAnalysis.article_ids || [] });
        
        const articles = (storyResp.articles || []).map(a => ({
          article_id: a.id,
          title: a.title,
          url: a.url,
          source: a.source,
          snippet: a.snippet || "",
          published_at: a.published_at
        }));

        const analysisUrl = `${ANALYSIS_API_BASE}/api/analysis/generate`;
        const analysisResp = await postJson(analysisUrl, {
          story_title_norm: currentStoryForAnalysis.story_title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          story_title: currentStoryForAnalysis.story_title,
          articles: articles,
          control_site: controlSite,
          control_article_url: controlArticle,
          additional_prompt: additionalPrompt,
          chart_data: chartData || null,
          chart_explanation: chartExplanation || null,
          ai_tool_choice: aiTool
        });

        if (!analysisResp.ok || !analysisResp.analysis){
          throw new Error("Analysis generation failed");
        }

        const analysis = analysisResp.analysis;

        // The body already contains chart HTML if chart was generated
        const bodyHtml = analysis.analysis_body
          .split('\n\n')
          .map(p => {
            // Skip paragraphs that are chart containers (already have HTML)
            if (p.includes('<div class="chart-container"')) {
              return p;
            }
            // Convert markdown links to HTML for regular paragraphs
            return `<p>${p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')}</p>`;
          })
          .join('');

        el("ncAnalysisResult").innerHTML = `
          <div class="nc-analysis-result">
            ${analysis.featured_image_url ? `<img src="${escapeHtml(analysis.featured_image_url)}" alt="Analysis illustration" class="nc-analysis-img" />` : ''}
            <div class="nc-analysis-title">${escapeHtml(analysis.analysis_title)}</div>
            <div class="nc-analysis-summary">${escapeHtml(analysis.analysis_summary)}</div>
            <div class="nc-analysis-body">${bodyHtml}</div>
            ${analysis.chart_image_url && !analysis.analysis_body.includes('<div class="chart-container"') ? `
              <div style="margin-top: 20px; text-align: center;">
                <img src="${escapeHtml(analysis.chart_image_url)}" alt="Data visualization" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
              </div>
            ` : ''}
          </div>
        `;

        writeBtn.textContent = "✓ Analysis Complete";
        cancelBtn.textContent = "Close";
        cancelBtn.disabled = false;

      }catch(err){
        el("ncAnalysisResult").innerHTML = `<div class="nc-empty" style="border-color:#fecaca;background:#fef2f2;color:#991b1b;">❌ Error: ${escapeHtml(err.message || String(err))}</div>`;
        writeBtn.textContent = "Retry";
        writeBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    }

    async function loadStories(){
      const projectId = (el("ncProjectId").value || "").trim();
      const windowMinutes = parseInt(el("ncWindowMinutes").value || DEFAULT_WINDOW_MINUTES, 10);
      const minCountNow = parseInt(el("ncMinCountNow").value || DEFAULT_MIN_COUNT_NOW, 10);

      if (!projectId) return setStatus("Please enter a Project ID.", true);

      setStatus("Loading…");
      el("ncResults").innerHTML = "";
      el("ncSummary").innerHTML = "";

      try {
        const url = `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/cluster_results`;
        const payload = await postJson(url, { window_minutes: windowMinutes, min_count_now: minCountNow });
        lastPayload = payload;

        const c = payload.counts || {};
        const stories = payload.stories || [];

        el("ncSummary").innerHTML = `
          <div class="nc-results-header">
            <div class="nc-meta">
              <div><b>Project:</b> ${escapeHtml(payload.project_id)}</div>
              <div><b>as_of:</b> ${escapeHtml(payload.as_of)}</div>
              <div><b>window_minutes:</b> ${escapeHtml(payload.window_minutes)}</div>
            </div>
            <div class="nc-pills">
              <div class="nc-pill">Stories: ${c.stories_returned ?? stories.length}</div>
              <div class="nc-pill">Articles: ${c.articles_total ?? "-"}</div>
            </div>
          </div>
        `;

        const sorted = [...stories].sort((a,b)=>{
          const ac = (a.article_count ?? (a.article_ids?.length||0));
          const bc = (b.article_count ?? (b.article_ids?.length||0));
          return bc - ac;
        });

        el("ncResults").innerHTML = `
          <div class="nc-section">
            <div class="nc-section-title">Stories (${sorted.length})</div>
            <div class="nc-grid">${sorted.map((st,i)=>renderStoryCard(st,i)).join("")}</div>
          </div>
        `;

        document.querySelectorAll(".nc-open").forEach((a)=>{
          a.addEventListener("click",(e)=>{
            e.preventDefault();
            openStoryDrawer(parseInt(a.getAttribute("data-idx"),10));
          });
        });

        document.querySelectorAll(".nc-deep-analysis").forEach((btn)=>{
          btn.addEventListener("click",()=>{
            openAnalysisModal(parseInt(btn.getAttribute("data-idx"),10));
          });
        });

        setStatus("✓ Loaded.");
      } catch(err) {
        setStatus(err.message || String(err), true);
      }
    }

    el("ncWindowMinutes").value = DEFAULT_WINDOW_MINUTES;
    el("ncMinCountNow").value = DEFAULT_MIN_COUNT_NOW;

    el("ncRunBtn").addEventListener("click", loadStories);
    el("ncCloseDrawer").addEventListener("click", closeDrawer);
    el("ncCloseAnalysisModal").addEventListener("click", closeAnalysisModal);
    el("ncCancelAnalysis").addEventListener("click", closeAnalysisModal);
    el("ncWriteAnalysis").addEventListener("click", writeAnalysis);
    el("ncOverlay").addEventListener("click", ()=>{
      closeDrawer();
      closeAnalysisModal();
    });

    console.log("✓ News Cluster App V1.9 initialized successfully!");
  }
})();
