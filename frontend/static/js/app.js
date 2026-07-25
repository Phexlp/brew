const { useState, useEffect, useRef, useCallback } = React;

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const DOMAIN_META = {
  web_security:    { label: 'Web',      color: '#3B82F6' },
  network_security:{ label: 'Network',  color: '#14B8A6' },
  dfir:            { label: 'DFIR',     color: '#D946EF' },
  soc_siem:        { label: 'SOC/SIEM', color: '#0EA5E9' },
  threat_hunting:  { label: 'Hunting',  color: '#8B5CF6' },
  malware_re:      { label: 'Malware',  color: '#EC4899' },
};

const TIER_META = {
  'Foundation':   { color: '#F59E0B', nodeClass: 'node-foundation', dotClass: 'dot-foundation' },
  'Primary Path': { color: '#06B6D4', nodeClass: 'node-primary',    dotClass: 'dot-primary'    },
  'Stretch':      { color: '#8B5CF6', nodeClass: 'node-stretch',    dotClass: 'dot-stretch'    },
  'Skip':         { color: '#374151', nodeClass: 'node-skip',       dotClass: 'dot-skip'       },
};

const ROLES = [
  { id: 'soc_analyst',      label: 'SOC Analyst L1'   },
  { id: 'pentester',        label: 'Pentester'      },
  { id: 'dfir_specialist',  label: 'DFIR Analyst'   },
  { id: 'threat_hunter',    label: 'Threat Hunter'  },
];

const VIEWS = [
  { id: 'main',     label: 'Main' },
  { id: 'timeline', label: 'Timeline Constructor' }
];

// ─── HELPERS ─────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── PDF PREVIEW ─────────────────────────────────────────────────────────
// Renders the actual uploaded PDF using PDF.js. Falls back to a
// document placeholder for DOCX files.
function DocumentPreview({ file, parsedCv }) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const docxRef      = useRef(null);
  const [numPages,   setNumPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfDoc,     setPdfDoc]     = useState(null);
  const [docxHtml,   setDocxHtml]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [renderErr,  setRenderErr]  = useState(false);

  const filename = file ? file.name.toLowerCase() : (parsedCv ? parsedCv.filename.toLowerCase() : '');
  const isPDF = filename.endsWith('.pdf');
  const isDOCX = filename.endsWith('.docx') || filename.endsWith('.doc');

  useEffect(() => {
    if (!file) return;
    
    let isCancelled = false;
    let loadingTask = null;

    setLoading(true);
    setRenderErr(false);
    setCurrentPage(1);
    setPdfDoc(null);
    setDocxHtml('');

    const loadDoc = async () => {
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          if (isCancelled) return;
          try {
            const arrayBuffer = e.target.result;
            
            if (isPDF && typeof window.pdfjsLib !== 'undefined') {
              const typedArray = new Uint8Array(arrayBuffer);
              loadingTask = window.pdfjsLib.getDocument({ data: typedArray });
              const pdf = await loadingTask.promise;
              if (isCancelled) return;
              setNumPages(pdf.numPages);
              setPdfDoc(pdf);
            } else if (isDOCX && typeof window.mammoth !== 'undefined') {
              const result = await window.mammoth.convertToHtml({ arrayBuffer });
              if (isCancelled) return;
              setDocxHtml(result.value);
            }
          } catch (err) {
            if (!isCancelled) {
              console.error('Document load error:', err);
              setRenderErr(true);
            }
          } finally {
            if (!isCancelled) setLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        if (!isCancelled) {
          console.error('FileReader error:', err);
          setRenderErr(true);
          setLoading(false);
        }
      }
    };

    loadDoc();
    
    return () => {
      isCancelled = true;
      if (loadingTask) {
        try { loadingTask.destroy(); } catch (e) {}
      }
    };
  }, [file, isPDF, isDOCX]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !isPDF) return;

    let renderTask = null;
    let isCancelled = false;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;
        
        const containerW = containerRef.current?.clientWidth || 320;
        const nativeVp   = page.getViewport({ scale: 1 });
        const scale      = Math.min((containerW - 2) / nativeVp.width, 2.5);
        const viewport   = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const ctx    = canvas.getContext('2d');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('PDF render error:', err);
        }
      }
    };

    render();
    
    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, currentPage, isPDF]);

  if (!file) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', alignItems:'center', justifyContent:'center', padding:'2rem' }}>
        <div style={{ fontSize:'2.5rem', opacity:0.3 }}>📘</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-muted)', textAlign:'center', marginTop:'1rem' }}>
          NO DOCUMENT AVAILABLE<br/><br/>Upload a CV to see preview
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* ── Document container */}
      <div ref={containerRef} className="pdf-preview-scroll" style={{ overflowY: isDOCX ? 'auto' : 'hidden', backgroundColor: isDOCX ? '#ffffff' : 'transparent', color: isDOCX ? '#000' : 'inherit' }}>
        {loading && (
          <div className="pdf-loading-placeholder">
            <div className="scanner-line" style={{ width:'80%', margin:'0 auto' }} />
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-muted)', marginTop:'1rem' }}>
              Rendering Document…
            </div>
          </div>
        )}
        {renderErr && (
          <div className="pdf-loading-placeholder" style={{ color:'var(--text-muted)' }}>
            Could not render preview
          </div>
        )}
        
        {isPDF && (
          <canvas
            ref={canvasRef}
            className="pdf-canvas"
            style={{ display: loading || renderErr ? 'none' : 'block' }}
          />
        )}
        
        {isDOCX && !loading && !renderErr && (
          <div style={{ padding: '1.5rem', fontFamily: 'sans-serif' }} dangerouslySetInnerHTML={{ __html: docxHtml }} />
        )}
        
        {isPDF && <div className="pdf-fade" />}
      </div>

      {/* ── Page navigation */}
      {isPDF && numPages > 1 && (
        <div className="pdf-page-nav">
          <button
            className="pdf-nav-btn"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >←</button>
          <span className="pdf-page-label">{currentPage} / {numPages}</span>
          <button
            className="pdf-nav-btn"
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >→</button>
        </div>
      )}
    </div>
  );
}

// ─── ENTITY EXTRACTION STREAM ─────────────────────────────────────────
function ExtractionStream({ parsedCv }) {
  if (!parsedCv) return null;
  const { certifications = [], skills = [], job_titles = [], detected_domains = {} } = parsedCv;

  const domainForSkill = (skill) => {
    const lower = skill.toLowerCase();
    for (const [domId, meta] of Object.entries(DOMAIN_META)) {
      // heuristic: if the skill appears in a domain keyword from the backend it gets colored
    }
    // fallback: cycle through domain colors based on hash
    const keys = Object.keys(DOMAIN_META);
    let h = 0;
    for (let c of lower) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return DOMAIN_META[keys[h % keys.length]];
  };

  return (
    <div className="extraction-panel">
      {job_titles.length > 0 && (
        <div>
          <div className="extraction-section-title">Job Titles Detected</div>
          <div className="entity-chip-cloud">
            {job_titles.map((t, i) => (
              <span
                key={i}
                className="entity-chip"
                style={{
                  borderLeftColor: '#8B5CF6',
                  background: 'rgba(139,92,246,0.08)',
                  color: '#C4B5FD',
                  animationDelay: `${i * 50}ms`
                }}
              >{t}</span>
            ))}
          </div>
        </div>
      )}

      {certifications.length > 0 && (
        <div>
          <div className="extraction-section-title">Certifications Found</div>
          <div className="entity-chip-cloud">
            {certifications.map((c, i) => (
              <span
                key={i}
                className="entity-chip chip-cert"
                style={{ animationDelay: `${(job_titles.length + i) * 50}ms` }}
              >{c}</span>
            ))}
          </div>
        </div>
      )}

      {skills.length > 0 && (
        <div>
          <div className="extraction-section-title">Technical Skills — {skills.length} extracted</div>
          <div className="entity-chip-cloud">
            {skills.map((s, i) => {
              const dm = domainForSkill(s);
              return (
                <span
                  key={i}
                  className="entity-chip"
                  style={{
                    borderLeftColor: dm.color,
                    animationDelay: `${(job_titles.length + certifications.length + i) * 35}ms`
                  }}
                >{s}</span>
              );
            })}
          </div>

          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-bright)', marginTop: '1.5rem', marginBottom: '0.3rem' }}>Proficiency contributor</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            These extracted skills directly map to the domains that shape your Skill Proficiency Radar:
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              {Object.entries(detected_domains).filter(([k, v]) => v > 0).map(([k, v]) => (
                <span key={k} style={{ color: DOMAIN_META[k]?.color || '#fff', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  {DOMAIN_META[k]?.label}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {skills.length === 0 && certifications.length === 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
          No cybersecurity entities detected in this document.
        </div>
      )}
    </div>
  );
}

// ─── DOMAIN BARS ─────────────────────────────────────────────────────────
function DomainBars({ domainScores, targetRoleName }) {
  return (
    <div className="glass-card domain-bars-card">
      <div className="card-header">
        <div>
          <div className="card-label">Role Gap Analysis</div>
          <div className="card-title">vs {targetRoleName}</div>
        </div>
      </div>
      <div className="card-body">
        {domainScores.map((ds) => {
          const meta = DOMAIN_META[ds.domain_id] || { color: '#06B6D4', label: ds.domain_name };
          const gap = ds.target_score - ds.user_score;
          const hasGap = gap > 0;
          return (
            <div key={ds.domain_id} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                <span style={{ fontWeight: 600, color: '#fff', letterSpacing: '0.05em' }}>{meta.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: hasGap ? '#EF4444' : '#10B981' }}>
                  {hasGap ? `DIFFERENCE: ${Math.round(gap)} PTS` : 'EXCEEDS TARGET'}
                </span>
              </div>
              <div style={{ position: 'relative', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'visible' }}>
                {/* User Score Fill */}
                <div
                  style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: `${Math.min(100, ds.user_score)}%`,
                    background: `linear-gradient(90deg, ${meta.color}50, ${meta.color})`,
                    borderRadius: '4px',
                    transition: 'width 0.6s var(--ease-out)'
                  }}
                />
                {/* Target Marker */}
                <div 
                  style={{
                    position: 'absolute', top: '-4px', bottom: '-4px',
                    left: `${Math.min(100, ds.target_score)}%`, width: '3px',
                    background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.8)',
                    borderRadius: '2px', zIndex: 2,
                    transition: 'left 0.6s var(--ease-out)'
                  }}
                  title={`Target: ${ds.target_score}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── D3 RADAR CHART ──────────────────────────────────────────────────────
function RadarChart({ domainScores }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!domainScores || !svgRef.current) return;
    const container = d3.select(svgRef.current);
    container.selectAll('*').remove();

    const W = 340, H = 300, margin = 52;
    const radius = Math.min(W, H) / 2 - margin;
    const cx = W / 2, cy = H / 2;
    const N = domainScores.length;
    const angle = (Math.PI * 2) / N;
    const rScale = d3.scaleLinear().domain([0, 100]).range([0, radius]);

    const svg = container
      .append('svg')
      .attr('width', W)
      .attr('height', H)
      .attr('viewBox', `0 0 ${W} ${H}`);

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Concentric rings
    [20, 40, 60, 80, 100].forEach((lvl, li) => {
      const pts = Array.from({ length: N }, (_, i) => {
        const r = rScale(lvl);
        return `${r * Math.sin(i * angle)},${-r * Math.cos(i * angle)}`;
      });
      g.append('polygon')
        .attr('points', pts.join(' '))
        .attr('fill', 'none')
        .attr('stroke', li === 4 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)')
        .attr('stroke-width', li === 4 ? 1.2 : 0.8);
    });

    // Axis lines
    domainScores.forEach((_, i) => {
      g.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', radius * Math.sin(i * angle))
        .attr('y2', -radius * Math.cos(i * angle))
        .attr('stroke', 'rgba(255,255,255,0.05)')
        .attr('stroke-width', 1);
    });

    // Axis labels
    domainScores.forEach((d, i) => {
      const a = i * angle;
      const meta = DOMAIN_META[d.domain_id] || { label: d.domain_name, color: '#06B6D4' };
      const lx = (radius + 20) * Math.sin(a);
      const ly = -(radius + 16) * Math.cos(a);
      g.append('text')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', Math.sin(a) > 0.1 ? 'start' : Math.sin(a) < -0.1 ? 'end' : 'middle')
        .attr('dy', '0.35em')
        .attr('fill', meta.color)
        .attr('font-size', '9.5px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-weight', '500')
        .attr('letter-spacing', '0.04em')
        .text(meta.label.toUpperCase());
    });

    const makePath = (key) => domainScores.map((d, i) => {
      const v = Math.min(100, Math.max(0, d[key]));
      const r = rScale(v);
      return `${r * Math.sin(i * angle)},${-r * Math.cos(i * angle)}`;
    }).join(' ');

    // Target polygon
    g.append('polygon')
      .attr('points', makePath('target_score'))
      .attr('fill', 'rgba(139,92,246,0.07)')
      .attr('stroke', 'rgba(139,92,246,0.5)')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '4,3');

    // User polygon
    g.append('polygon')
      .attr('points', makePath('user_score'))
      .attr('fill', 'rgba(6,182,212,0.15)')
      .attr('stroke', '#06B6D4')
      .attr('stroke-width', 2);

    // Dots
    domainScores.forEach((d, i) => {
      const a = i * angle;
      const v = Math.min(100, Math.max(0, d.user_score));
      const r = rScale(v);
      g.append('circle')
        .attr('cx', r * Math.sin(a))
        .attr('cy', -r * Math.cos(a))
        .attr('r', 3.5)
        .attr('fill', '#06B6D4')
        .attr('stroke', '#050912')
        .attr('stroke-width', 1.5);
    });

    // Legend
    const leg = svg.append('g').attr('transform', `translate(10, ${H - 28})`);
    leg.append('line').attr('x1',0).attr('y1',5).attr('x2',14).attr('y2',5).attr('stroke','#06B6D4').attr('stroke-width',2);
    leg.append('text').attr('x',18).attr('y',9).attr('fill','rgba(255,255,255,0.35)').attr('font-size','8px').attr('font-family','JetBrains Mono, monospace').text('YOU');
    leg.append('line').attr('x1',44).attr('y1',5).attr('x2',58).attr('y2',5).attr('stroke','rgba(139,92,246,0.7)').attr('stroke-width',1.5).attr('stroke-dasharray','4,3');
    leg.append('text').attr('x',62).attr('y',9).attr('fill','rgba(255,255,255,0.35)').attr('font-size','8px').attr('font-family','JetBrains Mono, monospace').text('TARGET');
  }, [domainScores]);

  return <div ref={svgRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />;
}

// ─── LAB TIMELINE ITEM ───────────────────────────────────────────────────
function LabItem({ lab, isDone, onToggle, index }) {
  const tier = TIER_META[lab.tier] || TIER_META['Skip'];

  return (
    <div className="lab-timeline-item" style={{ animationDelay: `${index * 28}ms` }}>
      <div className={`timeline-node ${tier.nodeClass}`}>
        <div className={`node-dot ${tier.dotClass}`} />
      </div>
      <div className={`lab-content ${isDone ? 'is-done' : ''}`}>
        <div className="lab-main">
          <div className="lab-name-row">
            <span className={`lab-name ${isDone ? 'is-done' : ''}`}>{lab.lab_title}</span>
            <span className="lab-id-tag">{lab.lab_id}</span>
          </div>
          <div className="lab-desc">{lab.description}</div>
          <div className="lab-meta-row">
            <span className="lab-meta-tag" style={{ 
              color: (lab.difficulty || '').toLowerCase().includes('beginner') ? '#10B981' :
                     (lab.difficulty || '').toLowerCase().includes('intermediate') ? '#F59E0B' :
                     ((lab.difficulty || '').toLowerCase().includes('advanced') || (lab.difficulty || '').toLowerCase().includes('expert')) ? '#EF4444' :
                     'var(--text-muted)'
            }}>
              ◈ {lab.difficulty}
            </span>
            <span className="lab-meta-tag" style={{ color: DOMAIN_META[lab.domain]?.color || 'var(--text-muted)' }}>
              ▪ {DOMAIN_META[lab.domain]?.label || lab.domain}
            </span>
          </div>
        </div>
        <div className="lab-action">
          {isDone ? (
            <button className="btn-done" onClick={() => onToggle(lab.lab_id)}>✓ Done</button>
          ) : (
            <button className="btn-launch" onClick={() => onToggle(lab.lab_id)}>Launch</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PHASE TIMELINE COMPONENT ─────────────────────────────────────────
function PhaseTimeline({ roadmap }) {
  const [activePhaseIdx, setActivePhaseIdx] = React.useState(0);
  
  if (!roadmap || roadmap.length === 0) return null;
  
  const activePhase = roadmap[activePhaseIdx];
  const totalLabs = roadmap.reduce((acc, p) => acc + (p.labs?.length || 0), 0);
  const totalHours = roadmap.reduce((acc, p) => acc + (p.est_hours || 0), 0);

  // Color per phase index
  const phaseColors = ['#06B6D4', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981', '#EC4899', '#F97316'];
  const getColor = (idx) => phaseColors[idx % phaseColors.length];

  return (
    <div style={{ padding: '2rem 0' }}>
      
      {/* Title + Stats */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.75rem', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>Personalised Lab Path</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
          Learning Timeline
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.85rem', color: 'var(--text-base)' }}>
          <span><strong style={{ color: '#fff' }}>{roadmap.length}</strong> Phases</span>
          <span><strong style={{ color: '#fff' }}>{totalLabs}</strong> Labs</span>
          <span><strong style={{ color: '#fff' }}>{totalHours}</strong> Hours</span>
        </div>
      </div>

      {/* ---- Horizontal Timeline Bar ---- */}
      <div style={{ position: 'relative', padding: '4rem 3rem 3rem', overflowX: 'auto' }}>
        {/* Background line */}
        <div style={{
          position: 'absolute', top: 'calc(4rem + 20px)', left: '3rem', right: '3rem',
          height: '4px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '2px'
        }} />
        {/* Active progress line */}
        <div style={{
          position: 'absolute', top: 'calc(4rem + 20px)', left: '3rem',
          width: `${((activePhaseIdx) / Math.max(roadmap.length - 1, 1)) * 100}%`,
          maxWidth: 'calc(100% - 6rem)',
          height: '4px', backgroundColor: getColor(activePhaseIdx), borderRadius: '2px',
          transition: 'width 0.4s var(--ease-out), background-color 0.3s',
          boxShadow: `0 0 12px ${getColor(activePhaseIdx)}40`
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', minWidth: roadmap.length > 5 ? `${roadmap.length * 160}px` : 'auto' }}>
          {roadmap.map((phase, idx) => {
            const isPast = idx < activePhaseIdx;
            const isCurrent = idx === activePhaseIdx;
            const isFuture = idx > activePhaseIdx;
            const nodeColor = isFuture ? 'rgba(255,255,255,0.15)' : getColor(idx);

            return (
              <div
                key={phase.phase_id}
                onClick={() => setActivePhaseIdx(idx)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  cursor: 'pointer', flex: 1, minWidth: '140px', position: 'relative'
                }}
              >
                {/* Diagonal label above */}
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
                  transform: 'rotate(-35deg)', transformOrigin: 'bottom left',
                  fontSize: '0.78rem', fontWeight: isCurrent ? 700 : 400,
                  color: isFuture ? 'var(--text-muted)' : '#fff',
                  whiteSpace: 'nowrap', transition: 'all 0.3s',
                  textShadow: isCurrent ? `0 0 8px ${getColor(idx)}80` : 'none'
                }}>
                  {phase.title}
                </div>

                {/* Node */}
                <div style={{
                  width: isCurrent ? '40px' : '28px',
                  height: isCurrent ? '40px' : '28px',
                  borderRadius: '50%',
                  backgroundColor: isCurrent ? nodeColor : isPast ? nodeColor : 'var(--bg-elevated)',
                  border: isFuture ? '3px solid rgba(255,255,255,0.15)' : `3px solid ${nodeColor}`,
                  boxShadow: isCurrent ? `0 0 20px ${nodeColor}60, 0 0 40px ${nodeColor}20` : 'none',
                  transition: 'all 0.3s var(--ease-out)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 2,
                  fontSize: isCurrent ? '0.85rem' : '0.7rem',
                  fontWeight: 700, color: isCurrent ? '#fff' : isPast ? '#fff' : 'var(--text-muted)'
                }}>
                  {isPast ? '✓' : idx + 1}
                </div>

                {/* Label below */}
                <div style={{
                  marginTop: '0.75rem', textAlign: 'center', transition: 'all 0.3s'
                }}>
                  <div style={{
                    fontSize: '0.75rem', fontWeight: isCurrent ? 700 : 500,
                    color: isFuture ? 'var(--text-muted)' : '#fff'
                  }}>
                    {phase.est_hours}h · {phase.labs?.length || 0} labs
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Active Phase Detail Panel ---- */}
      {activePhase && (
        <div style={{
          marginTop: '2rem',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          {/* Phase Header */}
          <div style={{
            padding: '1.5rem 2rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: `linear-gradient(90deg, ${getColor(activePhaseIdx)}12 0%, transparent 100%)`
          }}>
            <div>
              <div style={{
                fontSize: '0.7rem', letterSpacing: '1.5px', textTransform: 'uppercase',
                color: getColor(activePhaseIdx), marginBottom: '0.35rem', fontFamily: 'var(--font-mono)'
              }}>
                Phase {activePhaseIdx + 1} of {roadmap.length}
              </div>
              <h3 style={{ fontSize: '1.35rem', color: '#fff', fontWeight: 700, margin: 0 }}>
                {activePhase.title}
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-base)', marginTop: '0.35rem', margin: 0 }}>
                {activePhase.description}
              </p>
            </div>
            <div style={{
              padding: '0.5rem 1.25rem', borderRadius: '8px',
              backgroundColor: `${getColor(activePhaseIdx)}18`,
              border: `1px solid ${getColor(activePhaseIdx)}30`,
              color: getColor(activePhaseIdx),
              fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap'
            }}>
              {activePhase.est_hours}h
            </div>
          </div>

          {/* Labs List */}
          <div style={{ padding: '0.5rem 0' }}>
            {(activePhase.labs || []).map((lab, labIdx) => (
              <div key={lab.lab_id} style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '1rem 2rem',
                borderBottom: labIdx < activePhase.labs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                transition: 'background-color 0.2s',
                cursor: 'default'
              }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {/* Lab number */}
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  border: `2px solid ${getColor(activePhaseIdx)}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 600, color: getColor(activePhaseIdx),
                  flexShrink: 0
                }}>
                  {labIdx + 1}
                </div>

                {/* Lab info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>{lab.lab_title}</span>
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', opacity: 0.6 }}>{lab.lab_id}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-base)', marginTop: '0.2rem', lineHeight: 1.4 }}>
                    {lab.description}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem' }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600,
                      color: (lab.difficulty || '').toLowerCase().includes('beginner') ? '#10B981' :
                             (lab.difficulty || '').toLowerCase().includes('intermediate') ? '#F59E0B' :
                             '#EF4444'
                    }}>
                      ◈ {lab.difficulty}
                    </span>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600,
                      color: DOMAIN_META[lab.domain]?.color || 'var(--text-muted)'
                    }}>
                      ▪ {DOMAIN_META[lab.domain]?.label || lab.domain}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {lab.tier}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AUTHENTICATION SCREEN ──────────────────────────────────────────────────
function AuthScreen({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = { username, password }; // email is optional in backend
      const res = await axios.post(endpoint, payload);
      
      const { access_token, username: loggedInUser } = res.data;
      localStorage.setItem('pwndora_token', access_token);
      localStorage.setItem('pwndora_user', loggedInUser);
      onLoginSuccess(access_token, loggedInUser);
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="glass-card auth-card">
        <div className="auth-header">
          <div className="wordmark" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div className="status-pip" />
            <span className="wordmark-title">PWNDORA</span>
          </div>
          <h2 style={{ textAlign: 'center', fontSize: '1.2rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {isLogin ? 'Log in to access your personalized learning path.' : 'Register to generate your own cybersecurity career map.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          
          <div className="form-group">
            <label>Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="Enter your username"
              required 
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Enter your password"
              required 
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Authenticating...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="auth-toggle">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button className="auth-toggle-btn" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Register' : 'Log In'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────
function App() {
  const [authToken, setAuthToken]     = useState(localStorage.getItem('pwndora_token') || '');
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('pwndora_user') || 'demo_user');
  const [targetRole, setTargetRole] = useState('soc_analyst');
  const [activeView, setActiveView] = useState('main');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [pathData, setPathData]     = useState(null);
  const [activeTab, setActiveTab]   = useState('All');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [completedLabs, setCompletedLabs] = useState({});

  const fileInputRef = useRef(null);

  // ── Initial load (Stateless via IndexedDB)
  useEffect(() => {
    if (authToken && window.localforage) {
      const loadCache = async () => {
        try {
          const cachedData = await window.localforage.getItem('pwndora_pathData');
          if (cachedData) setPathData(cachedData);
          const cachedFile = await window.localforage.getItem('pwndora_file');
          if (cachedFile) setSelectedFile(cachedFile);
        } catch (e) {
          console.error("LocalForage load error:", e);
        }
      };
      loadCache();
    }
  }, [authToken]);

  const handleRoleChange = async (newRole) => {
    setTargetRole(newRole);
    if (!pathData) return;
    try {
      setLoading(true);
      const res = await axios.post('/api/recalculate-path', {
        target_role_id: newRole,
        parsed_cv: pathData.parsed_cv
      }, {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        }
      });
      setPathData(res.data);
      if (window.localforage) await window.localforage.setItem('pwndora_pathData', res.data);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not update target role.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Drag & drop
  const handleDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop      = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) validateAndUpload(e.dataTransfer.files[0]);
  };

  const validateAndUpload = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'doc'].includes(ext)) {
      setError('Please upload a PDF or Word document (.pdf / .docx)');
      return;
    }
    setError('');
    setSelectedFile(file);
    uploadCV(file);
  };

  const uploadCV = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('target_role_id', targetRole);

    try {
      setLoading(true);
      setError('');
      const res = await axios.post('/api/parse-cv', form, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      setPathData(res.data);
      if (window.localforage) {
        await window.localforage.setItem('pwndora_pathData', res.data);
        await window.localforage.setItem('pwndora_file', file);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Parsing failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadSampleCV = async (type) => {
    try {
      setLoading(true);
      const fname = type === 'pentester' ? 'sample_pentester.docx' : 'sample_soc_analyst.pdf';
      const res = await axios.get(`/static/samples/${fname}`, {
        responseType: 'blob'
      });
      const blob = res.data;
      const file = new File([blob], fname, { type: blob.type });
      setSelectedFile(file);
      await uploadCV(file);
    } catch (err) {
      setError('Could not load sample CV.');
      setLoading(false);
    }
  };

  const toggleLab = (labId) => {
    setCompletedLabs(prev => ({ ...prev, [labId]: !prev[labId] }));
  };

  const handleClearCV = async () => {
    if (window.localforage) {
      await window.localforage.removeItem('pwndora_pathData');
      await window.localforage.removeItem('pwndora_file');
    }
    setPathData(null);
    setSelectedFile(null);
  };

  const handleLogout = async () => {
    localStorage.removeItem('pwndora_token');
    localStorage.removeItem('pwndora_user');
    if (window.localforage) {
      await window.localforage.removeItem('pwndora_pathData');
      await window.localforage.removeItem('pwndora_file');
    }
    setAuthToken('');
    setCurrentUser('');
    setPathData(null);
    setSelectedFile(null);
  };

  // ── Filtered labs
  const filteredRoadmap = pathData?.roadmap?.map(phase => {
    return {
      ...phase,
      labs: phase.labs.filter(l => {
        if (activeTab === 'All') return true;
        return l.tier === activeTab;
      })
    };
  }).filter(phase => phase.labs.length > 0) || [];

  const tierCounts = pathData?.tier_counts || {};
  const totalLabsCount = pathData?.roadmap?.reduce((acc, phase) => acc + phase.labs.length, 0) || 0;

  // ── Has real CV data?
  const hasData = pathData && pathData.parsed_cv?.raw_text_length > 0;

  // ─────────────────────────────────────────────────────────────────────
  if (!authToken) {
    return <AuthScreen onLoginSuccess={(token, user) => {
      setAuthToken(token);
      setCurrentUser(user);
    }} />;
  }

  return (
    <div>
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-inner">
          {/* Wordmark */}
          <div className="wordmark">
            <div className="status-pip" />
            <span className="wordmark-title">PWNDORA</span>
            <span className="wordmark-slash">/</span>
            <span className="wordmark-subtitle">Career Mapper</span>
          </div>

          {/* Target Role Segmented Control */}
          <div className="role-segmented">
            {ROLES.map(r => (
              <button
                key={r.id}
                className={`role-seg-btn ${targetRole === r.id ? 'active' : ''}`}
                onClick={() => handleRoleChange(r.id)}
              >{r.label}</button>
            ))}
          </div>

          {/* View Segmented Control */}
          <div className="role-segmented" style={{ marginLeft: '1rem' }}>
            {VIEWS.map(v => (
              <button
                key={v.id}
                className={`role-seg-btn ${activeView === v.id ? 'active' : ''}`}
                onClick={() => setActiveView(v.id)}
                style={activeView === v.id ? { background: 'rgba(255,255,255,0.1)' } : {}}
              >{v.label}</button>
            ))}
          </div>

          {/* Right */}
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-bright)' }}>{currentUser}</span>
            <button className="auth-toggle-btn" style={{ padding: '0.3rem 0.6rem', border: '1px solid rgba(255,255,255,0.1)' }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── PAGE SHELL ─────────────────────────────────────────────── */}
      <div className="page-shell">

        {/* Error */}
        {error && (
          <div className="error-banner">
            <span>⚠</span> {error}
          </div>
        )}

        {/* ── UPLOAD HERO (shown when no real CV data) ───────────── */}
        {!hasData && !loading && (
          <section className="upload-hero">
            <div className="upload-eyebrow">Intelligence Intake</div>
            <h1 className="upload-headline">
              Map your path to<br /><span>cybersecurity expertise</span>
            </h1>
            <p className="upload-subtext">
              Upload your CV. Our NLP pipeline extracts skills, certifications, and experience across 6 domains — then builds your personalized lab sequence.
            </p>

            {/* Drop Zone */}
            <div
              id="cv-drop-zone"
              className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <div className="drop-icon">📄</div>
              <div className="drop-title">
                {isDragging ? 'Release to analyse' : 'Drop your resume here'}
              </div>
              <p className="drop-hint">or click to browse your files</p>
              <div className="drop-formats">
                <span className="format-chip">PDF</span>
                <span className="format-chip">DOCX</span>
                <span className="format-chip">DOC</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && validateAndUpload(e.target.files[0])}
              />
            </div>

            {/* Selected file preview */}
            {selectedFile && (
              <div className="file-selected-bar">
                <div className="file-selected-left">
                  <div className="file-type-icon">
                    {selectedFile.name.endsWith('.pdf') ? '📕' : '📘'}
                  </div>
                  <div>
                    <div className="file-name">{selectedFile.name}</div>
                    <div className="file-size">{formatBytes(selectedFile.size)} · {selectedFile.name.split('.').pop().toUpperCase()}</div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                  <span className="file-status">✓ Loaded</span>
                  <button className="btn-clear" onClick={() => setSelectedFile(null)}>Clear</button>
                </div>
              </div>
            )}

            {/* Divider + sample buttons */}
            <div className="upload-divider"><span>or try a demo</span></div>
            <div className="sample-row">
              <button id="sample-soc-btn" className="sample-btn" onClick={() => loadSampleCV('soc')}>
                ⚡ Main CV
              </button>
              <button id="sample-pent-btn" className="sample-btn" onClick={() => loadSampleCV('pentester')}>
                ⚡ Timeline Constructor CV
              </button>
            </div>
          </section>
        )}

        {/* ── LOADING STATE ──────────────────────────────────────────── */}
        {loading && (
          <div className="parse-loading">
            <div className="parse-loading-title">Extracting intelligence…</div>
            <div className="parse-loading-sub">Running pdfplumber → spaCy EntityRuler → taxonomy mapping</div>
            <div className="scanner-line" />
          </div>
        )}

        {/* ── DASHBOARD ──────────────────────────────────────────────── */}
        {hasData && !loading && activeView === 'timeline' && (
          <>
            {/* FULL-WIDTH TIMELINE VIEW */}
            <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
              <PhaseTimeline roadmap={pathData.roadmap} />
            </div>

            <div style={{ marginTop:'1.5rem', display:'flex', justifyContent:'center' }}>
              <button className="sample-btn" onClick={handleClearCV}>
                ↑ Upload a different CV
              </button>
            </div>
          </>
        )}
        {hasData && !loading && activeView === 'main' && (
          <>
            {/* ── TOP ROW: CV Intel (60%) + Radar+Stats (40%) ──── */}
            <div className="dashboard-layout">

              {/* LEFT: CV Intelligence card */}
              <div className="glass-card" style={{ minHeight: '480px' }}>
                <div className="card-header">
                  <div>
                    <div className="card-label">Document Intelligence</div>
                    <div className="card-title">
                      {pathData.parsed_cv.filename}
                    </div>
                  </div>
                  <div className="card-tag">
                    Parsed in {pathData.processing_time_ms}ms
                  </div>
                </div>

                {/* Two-panel split */}
                <div className="cv-intel-split" style={{ minHeight: '400px' }}>
                  <DocumentPreview file={selectedFile} parsedCv={pathData.parsed_cv} />
                  <ExtractionStream parsedCv={pathData.parsed_cv} />
                </div>
              </div>

              {/* RIGHT: Radar + Stats + Domain Bars */}
              <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

                {/* Radar */}
                <div className="glass-card">
                  <div className="card-header">
                    <div>
                      <div className="card-label">Skill Proficiency Radar</div>
                      <div className="card-title">{pathData.target_role_name}</div>
                    </div>
                  </div>
                  <div className="radar-chart-box">
                    <RadarChart domainScores={pathData.domain_scores} />
                  </div>
                </div>

                {/* Big stat numbers */}
                <div className="stat-row">
                  <div className="stat-cell">
                    <div className="stat-number">{pathData.parsed_cv.experience_years}</div>
                    <div className="stat-label">Yrs Exp</div>
                  </div>
                  <div className="stat-cell">
                    <div className="stat-number">{pathData.total_est_hours}</div>
                    <div className="stat-label">Path Hrs</div>
                  </div>
                  <div className="stat-cell">
                    <div className="stat-number">{totalLabsCount}</div>
                    <div className="stat-label">Total Labs</div>
                  </div>
                </div>

                {/* Domain bars */}
                <DomainBars domainScores={pathData.domain_scores} targetRoleName={pathData.target_role_name} />

              </div>
            </div>

            {/* ── LAB TIMELINE ─────────────────────────────────────── */}
            <div className="glass-card labs-section">
              <div className="card-header">
                <div>
                  <div className="card-label">Mission Sequence</div>
                  <div className="card-title">
                    Personalised Lab Path
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', fontWeight:'400', color:'var(--text-muted)', marginLeft:'0.75rem' }}>
                      {pathData.tier_counts['Primary Path'] || 0} primary · {pathData.tier_counts['Foundation'] || 0} foundation · {pathData.tier_counts['Stretch'] || 0} stretch
                    </span>
                  </div>
                </div>

                {/* Upload new CV button */}
                <button
                  id="upload-new-btn"
                  className="sample-btn"
                  style={{ fontSize:'0.75rem' }}
                  onClick={handleClearCV}
                >
                  ↑ New CV
                </button>
              </div>

              {/* Tier filter pills */}
              <div className="tier-filter-bar">
                {['All', 'Foundation', 'Primary Path', 'Stretch', 'Skip'].map(tier => {
                  const count = tier === 'All' ? totalLabsCount : (tierCounts[tier] || 0);
                  const activeClass =
                    activeTab === tier
                      ? tier === 'All'          ? 'active-all'
                      : tier === 'Foundation'   ? 'active-foundation'
                      : tier === 'Primary Path' ? 'active-primary'
                      : tier === 'Stretch'      ? 'active-stretch'
                      :                           'active-skip'
                      : '';
                  return (
                    <button
                      key={tier}
                      className={`tier-pill ${activeClass}`}
                      onClick={() => setActiveTab(tier)}
                    >
                      {tier} <span style={{ opacity: 0.6 }}>({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Roadmap Timeline */}
              <div className="roadmap-container">
                {filteredRoadmap.length === 0 && (
                  <div style={{ color:'var(--text-muted)', fontSize:'0.85rem', padding:'1rem 0' }}>
                    No labs in this tier.
                  </div>
                )}
                {filteredRoadmap.map((phase, pIdx) => (
                  <div key={phase.phase_id} className="roadmap-phase">
                    <div className="phase-header">
                      <div className="phase-number">0{pIdx + 1}</div>
                      <div className="phase-info">
                        <div className="phase-title">{phase.title}</div>
                        <div className="phase-desc">{phase.description}</div>
                      </div>
                      <div className="phase-hours">{phase.est_hours}h</div>
                    </div>
                    <div className="lab-timeline">
                      {phase.labs.map((lab, idx) => (
                        <LabItem
                          key={lab.lab_id}
                          lab={lab}
                          isDone={!!completedLabs[lab.lab_id]}
                          onToggle={toggleLab}
                          index={idx}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop:'1.5rem', display:'flex', justifyContent:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                <button className="sample-btn" onClick={handleClearCV}>
                  ↑ Upload a different CV
                </button>
                <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                  {pathData.parsed_cv.cv_hash}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
