import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

const cn = (...c) => c.filter(Boolean).join(" ");
const td = () => new Date().toISOString().split("T")[0];
const mkid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const genCode = () => String(Math.floor(1000 + Math.random() * 9000));
const fmtTime = (ts) => { var d = new Date(ts); var p = function(n) { return n < 10 ? "0" + n : "" + n; }; var now = new Date(); var sameDay = d.toDateString() === now.toDateString(); return (sameDay ? "" : (p(d.getMonth() + 1) + "/" + p(d.getDate()) + " ")) + p(d.getHours()) + ":" + p(d.getMinutes()); };
const MGR_REPLY_THRESHOLD_MIN = 30; // 학부모 메시지 미응답 N분 경과 시 매니저 알림

const INIT_USERS = [
  { id: "admin1", name: "관리자", role: "admin", password: "1234", avatar: "🛡️" },
  { id: "mgr1", name: "매니저", role: "manager", password: "1234", avatar: "👔" },
  { id: "inst1", name: "김선생", role: "instructor", password: "1234", avatar: "📚" },
  { id: "inst2", name: "박선생", role: "instructor", password: "1234", avatar: "📖" },
  { id: "stu1", name: "이학생", role: "student", password: "1234", classId: "A반", avatar: "🎒" },
  { id: "stu2", name: "최학생", role: "student", password: "1234", classId: "A반", avatar: "🎓" },
  { id: "stu3", name: "정학생", role: "student", password: "1234", classId: "B반", avatar: "📝" },
  { id: "stu4", name: "한학생", role: "student", password: "1234", classId: "B반", avatar: "✏️" },
];
const INIT_TB = [
  { id: "tb1", name: "수학 3-1", subject: "수학", icon: "📐", color: "#3b82f6", chapters: [
    { id: "ch1", title: "1단원: 덧셈과 뺄셈", lessons: [
      { id: "ls1", title: "세 자리 수의 덧셈", pages: "12~15p", tasks: ["12p 문제 1~5번", "13p 문제 6~10번", "14p 응용문제"] },
      { id: "ls2", title: "세 자리 수의 뺄셈", pages: "16~19p", tasks: ["16p 문제 1~5번", "17p 문제 6~10번", "18p 서술형"] },
      { id: "ls3", title: "덧셈과 뺄셈 혼합", pages: "20~23p", tasks: ["20p 기본문제", "21p 심화문제", "22~23p 단원평가"] },
    ]},
    { id: "ch2", title: "2단원: 곱셈", lessons: [
      { id: "ls4", title: "두 자리 × 한 자리", pages: "26~29p", tasks: ["26p 문제 1~5번", "27p 문제 6~10번", "28p 연습문제"] },
      { id: "ls5", title: "세 자리 × 한 자리", pages: "30~33p", tasks: ["30p 기본문제", "31p 문제 1~8번", "32~33p 종합문제"] },
    ]},
  ]},
  { id: "tb2", name: "English 7", subject: "영어", icon: "🔤", color: "#10b981", chapters: [
    { id: "ch1", title: "Unit 1: My Family", lessons: [
      { id: "ls1", title: "Vocabulary", pages: "8~11p", tasks: ["단어 1~15번 암기", "워크북 8p 완성"] },
      { id: "ls2", title: "Grammar - be동사", pages: "12~15p", tasks: ["12p 빈칸 채우기", "13p 문장 만들기", "14p 영작"] },
    ]},
  ]},
  { id: "tb3", name: "과학 3-1", subject: "과학", icon: "🔬", color: "#f59e0b", chapters: [
    { id: "ch1", title: "1단원: 물질의 성질", lessons: [
      { id: "ls1", title: "물질의 분류", pages: "10~13p", tasks: ["10p 관찰 기록", "12p 분류표 완성", "13p 확인문제"] },
      { id: "ls2", title: "상태 변화", pages: "14~17p", tasks: ["실험 보고서", "15p 그래프 해석", "17p 탐구문제"] },
    ]},
  ]},
];
const INIT_CUR = [{ key: "inst1__A반__tb1", lessons: [{ lessonId: "ch1__ls1", date: "2026-04-14" }, { lessonId: "ch1__ls2", date: "2026-04-15" }] }];
const INIT_SP = {};
const STU_AVATARS = ["🎒","🎓","📝","✏️","📓","🖊️","📒","📕","📗","📘","🎯","⭐","🌟","💡","🔑","🎨","🎵","🏀","⚽","🎾"];

function buildAssignments(textbooks, curriculum) {
  const list = [];
  curriculum.forEach(function(cur) {
    var parts = cur.key.split("__");
    var instId = parts[0], classId = parts[1], tbId = parts[2];
    var tb = textbooks.find(function(t) { return t.id === tbId; });
    if (!tb) return;
    cur.lessons.forEach(function(cl) {
      var lparts = cl.lessonId.split("__");
      var chId = lparts[0], lsId = lparts[1];
      var ch = tb.chapters.find(function(c) { return c.id === chId; });
      if (!ch) return;
      var ls = ch.lessons.find(function(l) { return l.id === lsId; });
      if (!ls) return;
      list.push({
        id: instId + "__" + classId + "__" + tbId + "__" + cl.lessonId,
        title: tb.icon + " " + tb.subject + " — " + ls.title,
        desc: tb.name + " " + ls.pages,
        instId: instId, classId: classId, tbId: tbId,
        chTitle: ch.title, pages: ls.pages, date: cl.date,
        items: ls.tasks.map(function(t, i) { return { id: "t" + i, label: t }; }),
        color: tb.color, tbName: tb.name, tbIcon: tb.icon,
      });
    });
  });
  return list;
}

function getPct(prog, sid, aid, items) {
  var d = (prog[sid] && prog[sid][aid]) ? prog[sid][aid] : [];
  return items.length === 0 ? 0 : Math.round((d.length / items.length) * 100);
}

var CSS = "\
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800;900&display=swap');\
:root{--bg:#f5f3ee;--card:#fff;--side:#1a1a2e;--side-h:#16213e;--acc:#0f3460;--tx:#2d2d2d;--tx2:#6b7280;--txs:#e2e8f0;--pri:#e94560;--pril:#ff6b81;--prib:#fef2f4;--ok:#10b981;--okb:#ecfdf5;--warn:#f59e0b;--warnb:#fffbeb;--bdr:#e5e7eb;--r:12px;--rs:8px;--rl:16px;--sh:0 4px 16px rgba(0,0,0,.06)}\
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--tx)}\
.app{display:flex;min-height:100vh}\
.sync-badge{position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:20px;font-size:11px;font-weight:600;z-index:1000;box-shadow:var(--sh)}\
.sync-badge.synced{background:#d1fae5;color:#065f46}.sync-badge.error{background:#fee2e2;color:#991b1b}\
.login-w{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e,#16213e 40%,#0f3460)}\
.lb{background:rgba(255,255,255,.95);padding:40px 34px;border-radius:24px;width:400px;max-width:92vw;box-shadow:0 24px 80px rgba(0,0,0,.3)}\
.lb h1{font-size:24px;font-weight:800;text-align:center;margin-bottom:2px;color:#1a1a2e}\
.lb .sub{text-align:center;color:var(--tx2);font-size:12px;margin-bottom:24px}\
.lf{margin-bottom:12px}.lf label{display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:#374151}\
.lf select,.lf input{width:100%;padding:10px 12px;border:2px solid var(--bdr);border-radius:var(--rs);font-size:13px;font-family:'Noto Sans KR';background:#fff}\
.lf select:focus,.lf input:focus{outline:none;border-color:var(--pri)}\
.lbtn{width:100%;padding:12px;border:none;border-radius:var(--rs);background:linear-gradient(135deg,var(--pri),var(--pril));color:#fff;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px}\
.lh{margin-top:14px;padding:10px;background:#f8fafc;border-radius:var(--rs);font-size:10px;color:var(--tx2);line-height:1.6}\
.side{width:220px;min-height:100vh;background:var(--side);padding:18px 12px;display:flex;flex-direction:column;flex-shrink:0}\
.sbr{display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:24px}\
.sbr-i{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--pri),var(--pril));display:flex;align-items:center;justify-content:center;font-size:16px}\
.sbr span{color:#fff;font-weight:700;font-size:15px}\
.snav{flex:1}\
.si{display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:var(--rs);color:#94a3b8;font-size:12px;font-weight:500;cursor:pointer;margin-bottom:2px;border:none;background:none;width:100%;text-align:left;font-family:'Noto Sans KR'}\
.si:hover{background:var(--side-h);color:var(--txs)}.si.on{background:var(--acc);color:#fff;font-weight:600}\
.si .ic{font-size:16px;width:20px;text-align:center}\
.su{display:flex;align-items:center;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.08);margin-top:10px}\
.su-a{width:34px;height:34px;border-radius:8px;background:var(--acc);display:flex;align-items:center;justify-content:center;font-size:18px}\
.su-n{color:#fff;font-size:12px;font-weight:600}.su-r{color:#64748b;font-size:9px;font-weight:500;text-transform:uppercase}\
.lo{background:#fee2e2;border:1px solid #fecaca;color:#dc2626;cursor:pointer;font-size:12px;padding:6px 12px;border-radius:8px;font-weight:700;font-family:'Noto Sans KR'}\
.lo:hover{background:#fecaca}\
.main{flex:1;padding:24px;overflow-y:auto;max-height:100vh}\
.ph{margin-bottom:20px}.ph h2{font-size:22px;font-weight:800;margin-bottom:2px}.ph p{color:var(--tx2);font-size:12px}\
.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px}\
.sc{background:var(--card);border-radius:var(--r);padding:16px;border:1px solid var(--bdr)}\
.sl{font-size:11px;color:var(--tx2);font-weight:500;margin-bottom:4px}\
.sv{font-size:26px;font-weight:800}.sv.r{color:var(--pri)}.sv.g{color:var(--ok)}.sv.a{color:var(--warn)}.sv.b{color:#3b82f6}\
.card{background:var(--card);border-radius:var(--rl);padding:20px;border:1px solid var(--bdr)}.card+.card{margin-top:12px}\
.ac{background:var(--card);border-radius:var(--rl);overflow:hidden;border:1px solid var(--bdr);margin-bottom:10px}.ac:hover{box-shadow:var(--sh)}\
.ahead{padding:14px 18px;display:flex;align-items:center;gap:10px;cursor:pointer}.ahead:hover{background:#fafaf8}\
.at{font-size:14px;font-weight:700;margin-bottom:1px}\
.am{font-size:10px;color:var(--tx2);display:flex;gap:8px;align-items:center;flex-wrap:wrap}\
.abody{padding:0 18px 16px;border-top:1px solid var(--bdr);padding-top:12px}\
.ti{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6}\
.tc{width:20px;height:20px;border-radius:6px;border:2px solid #d1d5db;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}\
.tc.ck{background:var(--ok);border-color:var(--ok)}\
.tl{font-size:12px;font-weight:500}.tl.dn{text-decoration:line-through;color:var(--tx2)}\
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}\
th{text-align:left;padding:9px 12px;font-weight:600;color:var(--tx2);font-size:10px;text-transform:uppercase;border-bottom:2px solid var(--bdr)}\
td{padding:10px 12px;border-bottom:1px solid #f3f4f6}\
.pb{width:100%;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden}.pbf{height:100%;border-radius:3px;transition:width .5s}\
.mo{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:100}\
.md{background:#fff;border-radius:var(--rl);padding:24px;width:560px;max-width:92vw;max-height:85vh;overflow-y:auto}\
.md h3{font-size:17px;font-weight:800;margin-bottom:16px}\
.fg{margin-bottom:12px}.fg label{display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:#374151}\
.fg input,.fg select,.fg textarea{width:100%;padding:8px 10px;border:2px solid var(--bdr);border-radius:var(--rs);font-size:12px;font-family:'Noto Sans KR'}\
.fg textarea{min-height:120px;resize:vertical;line-height:1.8}\
.row2{display:flex;gap:10px}.row2>*{flex:1}\
.btn{padding:8px 16px;border-radius:var(--rs);font-size:12px;font-weight:600;cursor:pointer;border:none;font-family:'Noto Sans KR'}\
.btn-p{background:linear-gradient(135deg,var(--pri),var(--pril));color:#fff}\
.btn-g{background:none;color:var(--tx2)}.btn-g:hover{background:#f3f4f6}\
.btn-s{padding:4px 10px;font-size:10px}\
.btn-ok{background:var(--ok);color:#fff}\
.btn-d{background:none;color:var(--pri);padding:2px 6px;font-size:16px;cursor:pointer;border:none}\
.br{display:flex;gap:6px;justify-content:flex-end;margin-top:14px}\
.fb{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}\
.fc{padding:5px 12px;border-radius:18px;font-size:11px;font-weight:600;border:2px solid var(--bdr);background:#fff;cursor:pointer;font-family:'Noto Sans KR'}\
.fc.on{border-color:var(--pri);background:var(--prib);color:var(--pri)}\
.chip{display:inline-flex;padding:3px 8px;background:#f3f4f6;border-radius:10px;font-size:10px;font-weight:500}\
.abadge{display:inline-flex;padding:2px 7px;border-radius:8px;font-size:9px;font-weight:700;background:#eff6ff;color:#3b82f6}\
.dbadge{display:inline-flex;padding:2px 8px;border-radius:8px;font-size:9px;font-weight:700}\
.exp{transition:transform .2s;font-size:12px;color:var(--tx2)}.exp.op{transform:rotate(180deg)}\
.empty{text-align:center;padding:40px 16px;color:var(--tx2)}.empty .eic{font-size:40px;margin-bottom:8px}\
.date-nav{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}\
.date-nav input[type=date]{padding:6px 10px;border:2px solid var(--bdr);border-radius:var(--rs);font-size:12px}\
.date-nav button{padding:6px 12px;border:2px solid var(--bdr);border-radius:var(--rs);background:#fff;cursor:pointer;font-size:11px;font-weight:600;font-family:'Noto Sans KR'}\
.date-nav button.today-btn{border-color:var(--pri);color:var(--pri);background:var(--prib)}\
.tb-card{border:2px solid var(--bdr);border-radius:var(--rl);overflow:hidden;margin-bottom:12px}\
.tb-head{padding:14px 18px;display:flex;align-items:center;gap:10px;cursor:pointer}.tb-head:hover{background:#fafaf8}\
.tb-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px}\
.tb-name{font-size:14px;font-weight:700}.tb-sub{font-size:10px;color:var(--tx2)}\
.tb-body{padding:0 18px 16px}\
.ch-title{font-size:11px;font-weight:700;color:var(--tx2);padding:8px 0 4px;border-bottom:1px solid #f3f4f6}\
.ls-row{display:flex;align-items:center;gap:8px;padding:8px 6px}.ls-row:hover{background:#f9fafb}\
.ls-ck{width:22px;height:22px;border-radius:50%;border:2.5px solid #d1d5db;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer}\
.ls-ck.done{background:var(--ok);border-color:var(--ok)}\
.ls-title{font-size:12px;font-weight:600}.ls-pages{font-size:10px;color:var(--tx2)}\
.ls-tasks{margin-left:30px;margin-bottom:4px}.ls-tasks span{display:block;font-size:10px;color:var(--tx2);padding:1px 0}\
.tabs{display:flex;border-bottom:2px solid var(--bdr);margin-bottom:16px;overflow-x:auto}\
.tab{padding:8px 14px;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--tx2);background:none;border-top:none;border-left:none;border-right:none;font-family:'Noto Sans KR';white-space:nowrap}\
.tab.on{color:var(--pri);border-bottom-color:var(--pri)}\
.hint{margin-top:14px;padding:12px;background:#eff6ff;border-radius:var(--rs);font-size:11px;color:#1e40af;line-height:1.6}\
.chart-card{background:var(--card);border-radius:var(--rl);padding:20px;border:1px solid var(--bdr);margin-bottom:14px}\
.chart-title{font-size:14px;font-weight:700;margin-bottom:14px}\
.chart-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}\
.chart-bar-label{font-size:11px;font-weight:600;width:70px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.chart-bar-bg{flex:1;height:24px;background:#f3f4f6;border-radius:6px;overflow:hidden;position:relative}\
.chart-bar-fill{height:100%;border-radius:6px;transition:width .6s ease}\
.chart-bar-text{font-size:10px;font-weight:700;color:#fff;position:absolute;left:8px;top:50%;transform:translateY(-50%)}\
.chart-bar-pct{font-size:11px;font-weight:700;width:40px;text-align:right;flex-shrink:0}\
.chart-legend{display:flex;gap:16px;margin-top:10px;flex-wrap:wrap}\
.chart-legend-item{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--tx2)}\
.chart-legend-dot{width:10px;height:10px;border-radius:3px}\
.donut-wrap{display:flex;align-items:center;gap:24px;flex-wrap:wrap}\
.donut-svg-wrap{position:relative;width:120px;height:120px;flex-shrink:0}\
.donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}\
.donut-pct{font-size:28px;font-weight:800}.donut-label{font-size:10px;color:var(--tx2)}\
.donut-stats{display:flex;flex-direction:column;gap:8px}\
.donut-stat{display:flex;align-items:center;gap:8px}\
.donut-stat-dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}\
.donut-stat-text{font-size:12px}.donut-stat-val{font-size:14px;font-weight:800;margin-left:auto}\
.stu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}\
.stu-card{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--r)}\
.stu-card:hover{box-shadow:var(--sh)}\
.stu-card-av{width:36px;height:36px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:18px}\
.stu-card-info{flex:1}.stu-card-name{font-size:13px;font-weight:700}.stu-card-meta{font-size:10px;color:var(--tx2)}\
.stu-card-actions{display:flex;gap:4px}\
.bulk-preview{max-height:200px;overflow-y:auto;margin:10px 0}\
.bulk-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f9fafb;border-radius:6px;margin-bottom:4px;font-size:12px}\
.bulk-count{display:inline-flex;padding:4px 12px;background:var(--prib);color:var(--pri);border-radius:12px;font-size:12px;font-weight:700;margin-left:8px}\
.new-class-input{margin-top:6px;width:100%;padding:8px 10px;border:2px solid var(--pri);border-radius:var(--rs);font-size:12px;font-family:'Noto Sans KR';background:#fff}\
@media(max-width:768px){.side{display:none}.main{padding:16px 12px}.sg{grid-template-columns:repeat(2,1fr)}.stu-grid{grid-template-columns:1fr}.mob-hd{display:flex!important}}\
.mob-hd{display:none;align-items:center;gap:10px;padding:10px 14px;margin:-16px -12px 14px;background:var(--side);border-radius:0 0 12px 12px}\
.mob-hd .mob-name{flex:1;color:#fff;font-size:13px;font-weight:700}\
.mob-hd .mob-role{color:#94a3b8;font-size:10px}\
.mob-hd .mob-lo{background:#fee2e2;border:1px solid #fecaca;color:#dc2626;font-size:11px;padding:6px 14px;border-radius:8px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR'}\
";

function PRing({ pct, size, stroke }) {
  size = size || 40; stroke = stroke || 3;
  var r = (size - stroke) / 2, c = 2 * Math.PI * r, o = c - (pct / 100) * c;
  var col = pct === 100 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--pri)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: col }}>{pct}%</div>
    </div>
  );
}
function PBar({ pct }) { var c = pct === 100 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--pri)"; return <div className="pb"><div className="pbf" style={{ width: pct + "%", background: c }} /></div>; }

function DonutChart({ completed, inProgress, notStarted, total }) {
  var size = 120, stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  var pctC = total === 0 ? 0 : Math.round((completed / total) * 100);
  var pctI = total === 0 ? 0 : Math.round((inProgress / total) * 100);
  var offC = c - (pctC / 100) * c, offI = c - ((pctC + pctI) / 100) * c;
  return (
    <div className="donut-wrap">
      <div className="donut-svg-wrap">
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
          {(pctI > 0 || notStarted > 0) && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f87171" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offI} strokeLinecap="round" />}
          {pctI > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fbbf24" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offC} strokeLinecap="round" />}
          {pctC > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#34d399" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offC < c ? offC : c} strokeLinecap="round" />}
        </svg>
        <div className="donut-center"><div className="donut-pct" style={{ color: pctC === 100 ? "var(--ok)" : "var(--tx)" }}>{pctC}%</div><div className="donut-label">전체 완료율</div></div>
      </div>
      <div className="donut-stats">
        <div className="donut-stat"><div className="donut-stat-dot" style={{ background: "#34d399" }} /><span className="donut-stat-text">완료</span><span className="donut-stat-val" style={{ color: "var(--ok)" }}>{completed}명</span></div>
        <div className="donut-stat"><div className="donut-stat-dot" style={{ background: "#fbbf24" }} /><span className="donut-stat-text">진행중</span><span className="donut-stat-val" style={{ color: "var(--warn)" }}>{inProgress}명</span></div>
        <div className="donut-stat"><div className="donut-stat-dot" style={{ background: "#f87171" }} /><span className="donut-stat-text">미시작</span><span className="donut-stat-val" style={{ color: "var(--pri)" }}>{notStarted}명</span></div>
      </div>
    </div>
  );
}
function BarChart({ data, title }) {
  return (
    <div className="chart-card"><div className="chart-title">{title}</div>
      {data.map(function(d, i) { var col = d.pct === 100 ? "#34d399" : d.pct >= 50 ? "#fbbf24" : "#f87171";
        return (<div key={i} className="chart-bar-row"><div className="chart-bar-label">{d.avatar} {d.name}</div><div className="chart-bar-bg"><div className="chart-bar-fill" style={{ width: Math.max(d.pct, 2) + "%", background: col }} />{d.pct > 15 && <span className="chart-bar-text">{d.pct}%</span>}</div><div className="chart-bar-pct" style={{ color: col }}>{d.pct}%</div></div>);
      })}
      <div className="chart-legend"><div className="chart-legend-item"><div className="chart-legend-dot" style={{ background: "#34d399" }} />완료</div><div className="chart-legend-item"><div className="chart-legend-dot" style={{ background: "#fbbf24" }} />진행중</div><div className="chart-legend-item"><div className="chart-legend-dot" style={{ background: "#f87171" }} />미흡</div></div>
    </div>
  );
}

function ClassSelect({ value, onChange, classes, label, editKey }) {
  var [mode, setMode] = useState("select");
  var [newName, setNewName] = useState("");
  
  // Reset to select mode when editKey changes (new edit session)
  useEffect(function() { setMode("select"); setNewName(""); }, [editKey]);

  if (mode === "new") {
    return (
      <div className="fg">
        <label>{label || "반"}</label>
        <input className="new-class-input" value={newName} onChange={function(e) { setNewName(e.target.value); }} placeholder="새 반 이름 입력 (예: C반)" autoFocus />
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button className="btn btn-p btn-s" type="button" onClick={function() { if (newName.trim()) { onChange(newName.trim()); setMode("select"); setNewName(""); } }}>확인</button>
          <button className="btn btn-g btn-s" type="button" onClick={function() { setMode("select"); setNewName(""); }}>취소</button>
        </div>
      </div>
    );
  }
  return (
    <div className="fg">
      <label>{label || "반"}</label>
      <select value={classes.indexOf(value) >= 0 ? value : classes[0] || ""} onChange={function(e) { if (e.target.value === "__new") { setMode("new"); } else { onChange(e.target.value); } }}>
        {classes.map(function(c) { return <option key={c} value={c}>{c}</option>; })}
        <option value="__new">+ 새 반 만들기</option>
      </select>
    </div>
  );
}

function Login({ users, onLogin, onParent }) {
  var [nm, setNm] = useState(""); var [pw, setPw] = useState(""); var [err, setErr] = useState("");
  var [selRole, setSelRole] = useState(null);
  var go = function() {
    if (!nm.trim()) { setErr("이름을 입력해주세요"); return; }
    if (!pw) { setErr("비밀번호를 입력해주세요"); return; }
    var found = users.filter(function(u) { return u.name === nm.trim(); });
    if (found.length === 0) { setErr("등록되지 않은 이름입니다"); return; }
    var matched = found.filter(function(x) { return x.password === pw; });
    if (matched.length === 0) { setErr("비밀번호가 틀렸습니다"); return; }
    if (matched.length === 1) { onLogin(matched[0]); return; }
    // 같은 이름+비밀번호가 여러명 → 역할 선택
    setSelRole(matched);
  };
  var roleLabels = { admin: "🛡️ 관리자", manager: "👔 매니저", instructor: "📚 강사", student: "🎒 학생", parent: "👨‍👩‍👧 학부모" };

  if (selRole) {
    return (
      <div className="login-w"><div className="lb notranslate" translate="no"><h1>📋 ROUTETOP 과제 관리</h1><p className="sub">같은 이름이 여러 계정에 있습니다. 선택해주세요.</p>
        {selRole.map(function(u) {
          return <button key={u.id} className="lbtn" style={{ marginBottom: 8 }} onClick={function() { onLogin(u); }}>{roleLabels[u.role] || u.role} — {u.name}{u.classId ? " (" + u.classId + ")" : ""}</button>;
        })}
        <button className="lbtn" style={{ background: "#e5e7eb", color: "var(--tx2)" }} onClick={function() { setSelRole(null); }}>← 돌아가기</button>
      </div></div>
    );
  }
  return (
    <div className="login-w"><div className="lb notranslate" translate="no"><h1>📋 ROUTETOP 과제 관리</h1><p className="sub">ROUTETOP 진도 연동 과제 관리 시스템</p>
      <div className="lf"><label>이름</label><input type="text" placeholder="이름을 입력하세요" value={nm} onChange={function(e) { setNm(e.target.value); setErr(""); }} onKeyDown={function(e) { if (e.key === "Enter") { var pwInput = document.getElementById("pw-input"); if (pwInput) pwInput.focus(); } }} autoFocus /></div>
      <div className="lf"><label>비밀번호</label><input id="pw-input" type="password" placeholder="비밀번호를 입력하세요" value={pw} onChange={function(e) { setPw(e.target.value); setErr(""); }} onKeyDown={function(e) { if (e.key === "Enter") go(); }} /></div>
      {err && <p style={{ color: "var(--pri)", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{err}</p>}
      <button className="lbtn" onClick={go}>로그인</button>
      <div style={{ marginTop: 16, textAlign: "center" }}><button onClick={function() { if (onParent) onParent(); }} style={{ background: "none", border: "none", fontSize: 12, color: "var(--tx2)", cursor: "pointer", textDecoration: "underline", fontFamily: "Noto Sans KR" }}>👨‍👩‍👧 학부모 출석 알림 →</button></div>
    </div></div>
  );
}

// ═══════════════════════════════════════
// 퇴원 진단 (담임 진단 + AI 자동 진단)
// ═══════════════════════════════════════
var WITHDRAW_REASONS = [
  { key: "mgmt", label: "관리 부재" },
  { key: "homework", label: "부실한 과제량" },
  { key: "attitude", label: "과제 외 태도 불량" },
  { key: "grade", label: "성적 하락" },
  { key: "system", label: "학원 시스템 문제" },
  { key: "etc", label: "기타" }
];
var WLABEL = {}; WITHDRAW_REASONS.forEach(function(r) { WLABEL[r.key] = r.label; });

function findHomeroom(student, users) {
  if (!student || !users) return null;
  return users.find(function(u) { return u.role === "instructor" && (u.assignedClasses || []).indexOf(student.classId) >= 0; }) || null;
}

// 통합 데이터 기반 자동 진단 엔진
function diagnoseWithdrawal(student, ctx) {
  var allA = ctx.allA || [], sp = ctx.sp || {}, scores = ctx.scores || {}, attendance = ctx.attendance || {}, messages = ctx.messages || [];
  var reasons = [];
  // 1) 과제 완료율 → 부실한 과제량
  var clsA = allA.filter(function(a) { return a.classId === student.classId; });
  var hwPct = null;
  if (clsA.length) hwPct = Math.round(clsA.reduce(function(s, a) { return s + getPct(sp, student.id, a.id, a.items); }, 0) / clsA.length);
  if (hwPct !== null) {
    if (hwPct < 60) reasons.push({ key: "homework", score: Math.min(95, 95 - hwPct), evidence: "과제 완료율 " + hwPct + "% (매우 저조)" });
    else if (hwPct < 75) reasons.push({ key: "homework", score: 55, evidence: "과제 완료율 " + hwPct + "% (다소 낮음)" });
  }
  // 2) 성적 추이 → 성적 하락
  var sc = scores[student.id];
  if (sc && sc.exams && sc.exams.length >= 2) {
    var exs = sc.exams.slice().sort(function(a, b) { return (a.date || "").localeCompare(b.date || ""); });
    var avgG = function(ex) { var gs = []; var subs = (ex && ex.subjects) || {}; Object.keys(subs).forEach(function(k) { var g = Number((subs[k] || {}).grade); if (g >= 1 && g <= 9) gs.push(g); }); return gs.length ? gs.reduce(function(a, b) { return a + b; }, 0) / gs.length : null; };
    var last = avgG(exs[exs.length - 1]), prev = avgG(exs[exs.length - 2]);
    if (last !== null && prev !== null) {
      var delta = last - prev; // 등급 숫자 증가 = 하락
      if (delta >= 1) reasons.push({ key: "grade", score: Math.min(95, 50 + delta * 25), evidence: "평균 등급 " + prev.toFixed(1) + "→" + last.toFixed(1) + " 하락" });
      else if (delta >= 0.5) reasons.push({ key: "grade", score: 55, evidence: "평균 등급 " + prev.toFixed(1) + "→" + last.toFixed(1) + " 소폭 하락" });
    }
  }
  // 3) 출결 → 과제 외 태도(불성실)
  var dayKeys = []; var nowD = new Date(); for (var i = 0; i < 14; i++) { var dd = new Date(nowD); dd.setDate(nowD.getDate() - i); dayKeys.push(dd.toISOString().split("T")[0]); }
  var attN = 0; dayKeys.forEach(function(k) { var a = attendance[k] || {}; if (a[student.id]) attN++; });
  if (attN <= 2) reasons.push({ key: "attitude", score: 70, evidence: "최근 2주 출석 " + attN + "일 (결석 잦음)" });
  else if (attN <= 4) reasons.push({ key: "attitude", score: 50, evidence: "최근 2주 출석 " + attN + "일" });
  // 4) 상담/메시지 부재 → 관리 부재
  var msgCnt = messages.filter(function(m) { return m.studentId === student.id; }).length;
  if (msgCnt === 0) reasons.push({ key: "mgmt", score: 60, evidence: "학부모-담임 상담/메시지 기록 없음" });
  // 정렬·요약
  reasons.sort(function(a, b) { return b.score - a.score; });
  var primary = reasons.length ? reasons[0].key : "system";
  var summary;
  if (!reasons.length) summary = "학생 데이터에서 뚜렷한 이탈 신호가 없습니다. 학원 시스템·환경 요인(시스템 문제/기타) 가능성을 검토하세요.";
  else summary = WLABEL[primary] + "이(가) 가장 유력합니다. " + reasons.slice(0, 2).map(function(r) { return WLABEL[r.key] + "(" + r.evidence + ")"; }).join(", ") + ".";
  return { reasons: reasons, primary: primary, summary: summary, hwPct: hwPct };
}

function aiFlaggedKeys(ai) { return (ai.reasons || []).filter(function(r) { return r.score >= 50; }).map(function(r) { return r.key; }); }
function diagMatches(teacherReasons, ai) { var f = aiFlaggedKeys(ai); return (teacherReasons || []).some(function(k) { return f.indexOf(k) >= 0; }); }

// 퇴원 진단 모달
function WithdrawalModal({ student, ctx, cur, onClose, onConfirm }) {
  var [sel, setSel] = useState([]);
  var [etc, setEtc] = useState("");
  var [note, setNote] = useState("");
  var ai = useMemo(function() { return diagnoseWithdrawal(student, ctx); }, [student]);
  var canSeeAI = cur && (cur.role === "manager" || cur.role === "admin");
  var hr = findHomeroom(student, ctx.users);
  var toggle = function(k) { setSel(function(p) { return p.indexOf(k) >= 0 ? p.filter(function(x) { return x !== k; }) : p.concat([k]); }); };
  var willMatch = diagMatches(sel, ai);
  var confirm = function() {
    if (!sel.length) { window.alert("담임 진단 사유를 1개 이상 선택하세요."); return; }
    if (sel.indexOf("etc") >= 0 && !etc.trim()) { window.alert("기타 사유를 입력하세요."); return; }
    onConfirm({
      id: "wd_" + mkid(), studentId: student.id, studentName: student.name, classId: student.classId,
      teacherId: hr ? hr.id : "", teacherName: hr ? hr.name : "",
      date: td(), teacherReasons: sel, teacherEtc: etc.trim(), teacherNote: note.trim(),
      ai: { reasons: ai.reasons, primary: ai.primary, summary: ai.summary },
      match: willMatch, by: { id: cur.id, role: cur.role, name: cur.name }
    });
  };
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 540 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>🚪 퇴원 진단 — {student.name} <span style={{ fontSize: 12, color: "var(--tx2)", fontWeight: 500 }}>{student.classId}{hr ? " · 담임 " + hr.name : ""}</span></h3>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pri)", margin: "10px 0 6px" }}>담임 진단 (퇴원 사유)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
        {WITHDRAW_REASONS.map(function(r) {
          var on = sel.indexOf(r.key) >= 0;
          return <button type="button" key={r.key} onClick={function() { toggle(r.key); }} style={{ padding: "8px 12px", borderRadius: 20, border: on ? "2px solid var(--pri)" : "1px solid var(--bdr)", background: on ? "var(--prib)" : "#fff", color: on ? "var(--pri)" : "var(--tx2)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>{on ? "✓ " : ""}{r.label}</button>;
        })}
      </div>
      {sel.indexOf("etc") >= 0 && <input value={etc} onChange={function(e) { setEtc(e.target.value); }} placeholder="기타 사유 입력" style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--bdr)", borderRadius: 9, fontSize: 13, fontFamily: "'Noto Sans KR'", marginBottom: 8 }} />}
      <textarea value={note} onChange={function(e) { setNote(e.target.value); }} placeholder="담임 메모 (선택)" rows={2} style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--bdr)", borderRadius: 9, fontSize: 13, fontFamily: "'Noto Sans KR'", marginBottom: 12 }} />

      {canSeeAI ? (
        <div style={{ border: "1px solid #c7d2fe", background: "#eef2ff", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#3730a3", marginBottom: 6 }}>🤖 AI 진단 <span style={{ fontSize: 10, fontWeight: 600, color: "#6366f1" }}>(매니저 이상 열람)</span></div>
          <div style={{ fontSize: 12.5, color: "#1e1b4b", marginBottom: 8, lineHeight: 1.5 }}>{ai.summary}</div>
          {ai.reasons.length > 0 && ai.reasons.map(function(r) {
            return <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.score >= 70 ? "#dc2626" : r.score >= 50 ? "#d97706" : "#9ca3af", flexShrink: 0 }} />
              <span style={{ fontWeight: 700, width: 96, flexShrink: 0 }}>{WLABEL[r.key]}</span>
              <span style={{ flex: 1, color: "#4b5563" }}>{r.evidence}</span>
            </div>;
          })}
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid #c7d2fe", fontSize: 12, fontWeight: 700, color: willMatch ? "#065f46" : "#6b7280" }}>
            {willMatch ? "✅ 담임 진단과 AI 진단 일치 → 담임 강사 평가 +1점" : "○ 현재 선택은 AI 진단과 일치하지 않습니다"}
          </div>
        </div>
      ) : (
        <div style={{ border: "1px dashed var(--bdr)", borderRadius: 12, padding: "11px 14px", marginBottom: 12, fontSize: 12, color: "var(--tx2)" }}>🔒 AI 진단 결과는 매니저 이상만 열람할 수 있습니다.</div>
      )}

      <div className="br"><button className="btn btn-g" onClick={onClose}>취소</button><button className="btn btn-p" onClick={confirm}>퇴원 확정</button></div>
    </div></div>
  );
}

// 퇴원 기록 + 강사 평가 (매니저 이상)
function AdminWithdrawals({ withdrawals, setWithdrawals, users, forceSave }) {
  var [fromD, setFromD] = useState("");
  var [toD, setToD] = useState("");
  var all = (withdrawals || []).slice().sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });
  var lastDate = all.length ? all[0].date : null;
  var insts = users.filter(function(u) { return u.role === "instructor"; });
  var evalScore = function(instId) { return (withdrawals || []).filter(function(w) { return w.teacherId === instId && w.match; }).length; };
  var remove = function(id) { if (window.confirm("이 퇴원 기록을 삭제할까요?")) { setWithdrawals(function(p) { return (p || []).filter(function(w) { return w.id !== id; }); }); forceSave(); } };
  var fmt = function(d) { return (d || "").replace(/-/g, "."); };
  var mLabel = function(m) { var p = m.split("-"); return p.length === 2 ? p[0] + "년 " + (+p[1]) + "월" : m; };
  var thisMonth = function() { var ym = td().slice(0, 7); setFromD(ym + "-01"); setToD(ym + "-31"); };
  var thisYear = function() { var y = td().slice(0, 4); setFromD(y + "-01-01"); setToD(y + "-12-31"); };
  var clearRange = function() { setFromD(""); setToD(""); };

  var filtered = all.filter(function(w) { var d = w.date || ""; return (!fromD || d >= fromD) && (!toD || d <= toD); });
  var groups = {}; filtered.forEach(function(w) { var m = (w.date || "").slice(0, 7) || "기타"; (groups[m] = groups[m] || []).push(w); });
  var months = Object.keys(groups).sort().reverse();
  var ranged = !!(fromD || toD);

  var dInput = { padding: "8px 10px", border: "1px solid var(--bdr)", borderRadius: 9, fontSize: 13, fontFamily: "'Noto Sans KR'" };
  var qBtn = { padding: "7px 12px", borderRadius: 18, border: "1px solid var(--bdr)", background: "#fff", fontSize: 12.5, fontWeight: 700, color: "var(--tx2)", cursor: "pointer", fontFamily: "'Noto Sans KR'" };

  return (
    <div>
      {/* 요약 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, background: "#fff", border: "1px solid var(--bdr)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11.5, color: "var(--tx2)" }}>총 퇴원생</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--pri)" }}>{all.length}<span style={{ fontSize: 13, fontWeight: 600 }}>명</span></div>
        </div>
        <div style={{ flex: 1.4, background: "#fff", border: "1px solid var(--bdr)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11.5, color: "var(--tx2)" }}>마지막 퇴원처리 날짜</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--tx)" }}>{lastDate ? fmt(lastDate) : "—"}</div>
        </div>
      </div>

      {/* 기간 조회 */}
      <div style={{ background: "#fff", border: "1px solid var(--bdr)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: "var(--tx)" }}>📅 퇴원 기간 조회</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <input type="date" value={fromD} onChange={function(e) { setFromD(e.target.value); }} style={dInput} />
          <span style={{ color: "var(--tx2)" }}>~</span>
          <input type="date" value={toD} onChange={function(e) { setToD(e.target.value); }} style={dInput} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={qBtn} onClick={thisMonth}>이번 달</button>
          <button style={qBtn} onClick={thisYear}>올해</button>
          <button style={Object.assign({}, qBtn, ranged ? {} : { borderColor: "var(--pri)", color: "var(--pri)" })} onClick={clearRange}>전체</button>
          {ranged && <span style={{ fontSize: 12, color: "var(--tx2)", alignSelf: "center", marginLeft: 4 }}>조회 결과 {filtered.length}건</span>}
        </div>
      </div>

      {/* 강사 평가 */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>강사 평가 — 진단 일치 점수</h3>
      <div className="sg" style={{ marginBottom: 18 }}>
        {insts.length === 0 ? <div style={{ fontSize: 12, color: "var(--tx2)" }}>강사가 없습니다</div> : insts.map(function(it) {
          return <div className="sc" key={it.id}><div className="sl">{it.avatar} {it.name}</div><div className="sv g">+{evalScore(it.id)}</div></div>;
        })}
      </div>

      {/* 월별 정리 */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>월별 퇴원 정리</h3>
      {months.length === 0 ? <div className="empty"><div className="eic">🚪</div><p>{ranged ? "해당 기간의 퇴원 기록이 없습니다" : "퇴원 기록이 없습니다"}</p></div> :
        months.map(function(m) {
          var recs = groups[m];
          return (
            <div key={m} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--pri)", color: "#fff", borderRadius: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{mLabel(m)}</span>
                <span style={{ fontSize: 12, marginLeft: "auto", background: "rgba(255,255,255,.22)", borderRadius: 10, padding: "1px 9px", fontWeight: 700 }}>{recs.length}명</span>
              </div>
              {recs.map(function(w) {
                var stu = users.find(function(u) { return u.id === w.studentId; });
                return (
                  <div key={w.id} className="card" style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 18 }}>{stu ? stu.avatar : "🎒"}</span>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{w.studentName}</span>
                      <span style={{ fontSize: 11.5, color: "var(--tx2)" }}>{w.classId}{w.teacherName ? " · 담임 " + w.teacherName : ""}</span>
                      {w.match && <span style={{ fontSize: 10, fontWeight: 800, color: "#065f46", background: "#d1fae5", borderRadius: 10, padding: "1px 8px" }}>일치 +1</span>}
                      <button className="btn-d" style={{ marginLeft: "auto", fontSize: 13 }} onClick={function() { remove(w.id); }}>✕</button>
                    </div>
                    <div style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, color: "var(--pri)", background: "var(--prib)", borderRadius: 8, padding: "2px 9px", marginBottom: 7 }}>🚪 퇴원처리 {fmt(w.date)}</div>
                    <div style={{ fontSize: 12.5, marginBottom: 4 }}><b style={{ color: "var(--pri)" }}>퇴원 사유:</b> {(w.teacherReasons || []).map(function(k) { return WLABEL[k]; }).join(", ") || "—"}{w.teacherEtc ? " (" + w.teacherEtc + ")" : ""}</div>
                    {w.teacherNote && <div style={{ fontSize: 11.5, color: "var(--tx2)", marginBottom: 4 }}>메모: {w.teacherNote}</div>}
                    <div style={{ fontSize: 12, background: "#eef2ff", borderRadius: 8, padding: "7px 10px" }}><b style={{ color: "#3730a3" }}>🤖 AI 진단:</b> {(w.ai && w.ai.summary) || "—"}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}

// ═══════════════════════════════════════
// 내신 성적 → 상담필요 (하락/70점 이하 감지 + 상담 기록)
// ═══════════════════════════════════════
function scoreCounselTriggers(newExam, prevExams) {
  var triggers = [];
  var subs = newExam.subjects || {};
  var prevNaeshin = (prevExams || []).filter(function(e) { return e.type === "내신"; }).sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); })[0];
  Object.keys(subs).forEach(function(sub) {
    var raw = (subs[sub] || {}).score;
    if (raw === "" || raw == null) return;
    var sc = Number(raw); if (isNaN(sc)) return;
    var rs = [];
    if (sc <= 70) rs.push("70점 이하");
    if (prevNaeshin && prevNaeshin.subjects && prevNaeshin.subjects[sub]) {
      var pv = Number(prevNaeshin.subjects[sub].score);
      if (!isNaN(pv) && pv >= 0 && pv <= 100 && sc < pv) rs.push("이전 " + pv + "점 → 하락");
    }
    if (rs.length) triggers.push({ sub: sub, score: sc, reasons: rs });
  });
  return triggers;
}
function fireNotif(title, body) { try { if (window.Notification && Notification.permission === "granted") new Notification(title, { body: body, icon: "/icon-192.png" }); } catch (e) {} }

function CounselModal({ counsel, onClose, onSave }) {
  var [note, setNote] = useState(counsel.note || "");
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 480 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>📋 상담 기록 — {counsel.studentName} <span style={{ fontSize: 12, color: "var(--tx2)", fontWeight: 500 }}>{counsel.classId}{counsel.teacherName ? " · 담임 " + counsel.teacherName : ""}</span></h3>
      <div style={{ fontSize: 12.5, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 9, padding: "9px 11px", margin: "8px 0 12px", fontWeight: 600 }}>⚠️ 상담 필요 사유: {counsel.reason}</div>
      <div className="fg"><label>상담 사항</label>
        <textarea value={note} onChange={function(e) { setNote(e.target.value); }} placeholder="상담 내용을 기록하세요 (학생 상태, 상담 결과, 후속 조치 등)" rows={5} style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--bdr)", borderRadius: 9, fontSize: 13, fontFamily: "'Noto Sans KR'", resize: "vertical" }} autoFocus />
      </div>
      <div className="br"><button className="btn btn-g" onClick={onClose}>닫기</button><button className="btn btn-p" onClick={function() { if (!note.trim()) { window.alert("상담 사항을 입력하세요."); return; } onSave(note.trim()); }}>상담 완료 저장</button></div>
    </div></div>
  );
}

// ═══════════════════════════════════════
// 접속 기록 (관리자·매니저·강사 로그인 로그)
// ═══════════════════════════════════════
function fetchClientIP(cb) {
  try {
    fetch("https://api.ipify.org?format=json").then(function(r) { return r.json(); }).then(function(d) { cb(d && d.ip ? d.ip : ""); }).catch(function() { cb(""); });
  } catch (e) { cb(""); }
}

function AdminAccessLogs({ accessLogs, setAccessLogs, forceSave }) {
  var pad = function(x) { return x < 10 ? "0" + x : "" + x; };
  var monthRange = function(offset) { var n = new Date(); var d = new Date(n.getFullYear(), n.getMonth() + (offset || 0), 1); var y = d.getFullYear(), m = d.getMonth(); return [y + "-" + pad(m + 1) + "-01", y + "-" + pad(m + 1) + "-" + pad(new Date(y, m + 1, 0).getDate())]; };
  var _mr = monthRange(0);
  var [roleF, setRoleF] = useState("all");
  var [fromD, setFromD] = useState(_mr[0]);
  var [toD, setToD] = useState(_mr[1]);
  var RL = { admin: "관리자", manager: "매니저", instructor: "강사" };
  var RC = { admin: "#c0392b", manager: "#7c5cbf", instructor: "#1a6fa8" };
  var fmt = function(t) { if (!t) return "—"; var d = new Date(t); if (isNaN(d.getTime())) return t; return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  var localDate = function(t) { var d = new Date(t); if (isNaN(d.getTime())) return ""; return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  var logs = (accessLogs || []).slice().sort(function(a, b) { return (b.time || "").localeCompare(a.time || ""); });
  var lastTime = logs.length ? logs[0].time : null;
  var periodLogs = logs.filter(function(l) { var d = localDate(l.time); return (!fromD || d >= fromD) && (!toD || d <= toD); });
  var filtered = roleF === "all" ? periodLogs : periodLogs.filter(function(l) { return l.role === roleF; });

  var clearAll = function() { if (window.confirm("접속 기록을 모두 삭제할까요?")) { setAccessLogs(function() { return []; }); forceSave(); } };
  var setThisMonth = function() { var r = monthRange(0); setFromD(r[0]); setToD(r[1]); };
  var setLastMonth = function() { var r = monthRange(-1); setFromD(r[0]); setToD(r[1]); };
  var setAllPeriod = function() { setFromD(""); setToD(""); };

  var downloadExcel = function() {
    if (filtered.length === 0) { window.alert("다운로드할 접속 기록이 없습니다."); return; }
    var rows = [["구분", "사용자", "접속일시", "IP주소"]];
    filtered.forEach(function(l) { rows.push([RL[l.role] || l.role, l.userName, fmt(l.time), l.ip || "확인불가"]); });
    var csv = "\uFEFF" + rows.map(function(r) { return r.map(function(c) { var s = String(c == null ? "" : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); }).join("\r\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url;
    a.download = "ROUTETOP_접속기록_" + (fromD || "전체") + "~" + (toD || "전체") + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  var dInput = { padding: "8px 10px", border: "1px solid var(--bdr)", borderRadius: 9, fontSize: 13, fontFamily: "'Noto Sans KR'" };
  var qBtn = function(on) { return { padding: "7px 12px", borderRadius: 18, border: on ? "2px solid var(--pri)" : "1px solid var(--bdr)", background: on ? "var(--prib)" : "#fff", fontSize: 12.5, fontWeight: 700, color: on ? "var(--pri)" : "var(--tx2)", cursor: "pointer", fontFamily: "'Noto Sans KR'" }; };
  var pill = function(key, label) {
    var on = roleF === key;
    return <button key={key} onClick={function() { setRoleF(key); }} style={qBtn(on)}>{label}</button>;
  };
  var roleCount = function(key) { return key === "all" ? periodLogs.length : periodLogs.filter(function(l) { return l.role === key; }).length; };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>🔐 접속 기록</h3>
        <span style={{ fontSize: 12, color: "var(--tx2)" }}>마지막 접속: {lastTime ? fmt(lastTime) : "—"}</span>
        {logs.length > 0 && <button className="btn btn-g btn-s" style={{ marginLeft: "auto", color: "#c0392b" }} onClick={clearAll}>전체 삭제</button>}
      </div>

      {/* 기간 설정 + 엑셀 다운로드 */}
      <div style={{ background: "#fff", border: "1px solid var(--bdr)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--tx)" }}>📅 조회 기간</span>
          <button className="btn btn-p btn-s" style={{ marginLeft: "auto" }} onClick={downloadExcel}>📥 엑셀 다운로드</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <input type="date" value={fromD} onChange={function(e) { setFromD(e.target.value); }} style={dInput} />
          <span style={{ color: "var(--tx2)" }}>~</span>
          <input type="date" value={toD} onChange={function(e) { setToD(e.target.value); }} style={dInput} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={qBtn(false)} onClick={setThisMonth}>이번 달</button>
          <button style={qBtn(false)} onClick={setLastMonth}>지난 달</button>
          <button style={qBtn(!fromD && !toD)} onClick={setAllPeriod}>전체 기간</button>
          <span style={{ fontSize: 12, color: "var(--tx2)", alignSelf: "center", marginLeft: 4 }}>조회 {filtered.length}건</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {pill("all", "전체 " + roleCount("all"))}
        {pill("admin", "관리자 " + roleCount("admin"))}
        {pill("manager", "매니저 " + roleCount("manager"))}
        {pill("instructor", "강사 " + roleCount("instructor"))}
      </div>

      {filtered.length === 0 ? <div className="empty"><div className="eic">🔐</div><p>해당 기간의 접속 기록이 없습니다</p></div> :
        <div>
          <div style={{ display: "flex", alignItems: "center", padding: "6px 12px", fontSize: 11, color: "var(--tx2)", fontWeight: 700 }}>
            <span style={{ width: 54 }}>구분</span><span style={{ flex: 1 }}>사용자</span><span style={{ width: 116, textAlign: "right" }}>접속 시간</span><span style={{ width: 108, textAlign: "right" }}>IP 주소</span>
          </div>
          {filtered.map(function(l) {
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", padding: "9px 12px", background: "#fff", border: "1px solid var(--bdr)", borderRadius: 10, marginBottom: 6 }}>
                <span style={{ width: 54 }}><span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: RC[l.role] || "#888", borderRadius: 8, padding: "2px 7px" }}>{RL[l.role] || l.role}</span></span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{l.userName}</span>
                <span style={{ width: 116, textAlign: "right", fontSize: 12, color: "var(--tx)" }}>{fmt(l.time)}</span>
                <span style={{ width: 108, textAlign: "right", fontSize: 11.5, color: "var(--tx2)", fontFamily: "monospace" }}>{l.ip || "확인불가"}</span>
              </div>
            );
          })}
        </div>}
      <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 10, lineHeight: 1.5 }}>＊ 기본 조회 기간은 이번 달(1일~말일)입니다. IP는 로그인 시점의 공인 IP이며 최근 500건까지 보관됩니다. 엑셀 다운로드는 현재 조회된 기록을 CSV(UTF-8)로 저장합니다.</div>
    </div>
  );
}

function AdminPage({ users, setUsers, textbooks, setTextbooks, curriculum, setCurriculum, allA, sp, classList, setClassList, hideCount, ohdap, setOhdap, forceSave, attendance, setAttendance, scores, setScores, selfCodes, setSelfCodes, messages, cur, withdrawals, setWithdrawals, counsels, setCounsels, accessLogs, setAccessLogs }) {
  var [tab, setTab] = useState("students");
  var [openThread, setOpenThread] = useState(null);
  var students = users.filter(function(u) { return u.role === "student"; });
  var pending = pendingReplyThreads(messages);
  var overdue = pending.filter(function(p) { return p.waitMin >= MGR_REPLY_THRESHOLD_MIN; });
  var stuName = function(sid) { var u = users.find(function(x) { return x.id === sid; }); return u ? u.name : "학생"; };
  var openStudent = openThread ? users.find(function(u) { return u.id === openThread; }) : null;
  // Combine registered classes + classes from students
  var allClasses = classList.slice();
  students.forEach(function(s) { if (allClasses.indexOf(s.classId) === -1) allClasses.push(s.classId); });
  allClasses.sort();
  return (
    <div>
      <div className="ph"><h2>{hideCount ? "👔 매니저 페이지" : "🛡️ 관리자 페이지"}</h2><p>학생, 강사, 교재, 진도를 관리하세요</p></div>

      {pending.length > 0 && <div className="card" style={{ marginBottom: 14, border: overdue.length > 0 ? "2px solid var(--pri)" : "1px solid var(--bdr)", background: overdue.length > 0 ? "#fef2f4" : "var(--card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>{overdue.length > 0 ? "📢" : "💬"}</span>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>답장 대기 학부모 메시지</h3>
          {overdue.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "var(--pri)", borderRadius: 10, padding: "1px 7px" }}>{MGR_REPLY_THRESHOLD_MIN}분+ 미응답 {overdue.length}</span>}
        </div>
        {pending.map(function(p) {
          var over = p.waitMin >= MGR_REPLY_THRESHOLD_MIN;
          var waitLabel = p.waitMin >= 60 ? Math.floor(p.waitMin / 60) + "시간 " + (p.waitMin % 60) + "분" : p.waitMin + "분";
          return (
            <div key={p.studentId} onClick={function() { setOpenThread(p.studentId); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 6px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}>
              <span style={{ fontSize: 14 }}>{over ? "🔴" : "🟡"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{stuName(p.studentId)} <span style={{ fontSize: 10, color: "var(--tx2)", fontWeight: 400 }}>· {p.last.fromName} 학부모님</span></div>
                <div style={{ fontSize: 11, color: "var(--tx2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.last.text}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: over ? "var(--pri)" : "var(--tx2)", flexShrink: 0, textAlign: "right" }}>{waitLabel} 대기</div>
            </div>
          );
        })}
        <div className="hint" style={{ marginTop: 8 }}>💡 학부모가 마지막으로 보낸 뒤 담당 강사 답장이 없는 대화입니다. 강사에게 확인을 요청하세요.</div>
      </div>}

      {openStudent && <div className="mo" onClick={function() { setOpenThread(null); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>💬 {openStudent.name} <span style={{ fontSize: 11, color: "var(--tx2)", fontWeight: 400 }}>({openStudent.classId})</span></h3>
          <button onClick={function() { setOpenThread(null); }} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--tx2)" }}>✕</button>
        </div>
        <MessageThread studentId={openStudent.id} cur={{ id: "__viewer__" }} messages={messages} />
      </div></div>}

      <div className="tabs notranslate" translate="no">
        {[["students", "🎒 학생"], ["attendance", "📋 출석"], ["scores", "📝 성적"], ["ohdap", "📝 오답데이"], ["stats", "📊 통계·결과"], ["instructors", "👨‍🏫 직원"], ["parents", "👨‍👩‍👧 학부모"], ["textbooks", "📚 교재"], ["curriculum", "📖 진도배정"], ["withdrawals", "🚪 퇴원"], ...(cur && cur.role === "admin" ? [["access", "🔐 접속기록"]] : []), ["settings", "⚙️ 설정"]].map(function(item) {
          var k = item[0], l = item[1];
          return <button key={k} className={cn("tab", tab === k && "on")} onClick={function() { setTab(k); }}>{l}</button>;
        })}
      </div>
      {tab === "students" && <AdminStudents users={users} setUsers={setUsers} allClasses={allClasses} hideCount={hideCount} forceSave={forceSave} allA={allA} sp={sp} scores={scores} attendance={attendance} messages={messages} cur={cur} withdrawals={withdrawals} setWithdrawals={setWithdrawals} />}
      {tab === "attendance" && <AdminAttendance users={users} attendance={attendance} setAttendance={setAttendance} forceSave={forceSave} selfCodes={selfCodes} setSelfCodes={setSelfCodes} />}
      {tab === "scores" && <AdminScores users={users} scores={scores} setScores={setScores} forceSave={forceSave} cur={cur} counsels={counsels} setCounsels={setCounsels} />}
      {tab === "ohdap" && <AdminOhdap users={users} ohdap={ohdap} setOhdap={setOhdap} forceSave={forceSave} />}
      {tab === "settings" && <AdminSettings users={users} setUsers={setUsers} classList={classList} setClassList={setClassList} forceSave={forceSave} hideCount={hideCount} />}
      {tab === "stats" && <AdminStats users={users} allA={allA} sp={sp} hideCount={hideCount} />}
      {tab === "instructors" && <AdminInstructors users={users} setUsers={setUsers} forceSave={forceSave} allClasses={allClasses} withdrawals={withdrawals} />}
      {tab === "parents" && <AdminParents users={users} setUsers={setUsers} forceSave={forceSave} />}
      {tab === "textbooks" && <AdminTextbooks textbooks={textbooks} setTextbooks={setTextbooks} />}
      {tab === "curriculum" && <AdminCurriculum users={users} textbooks={textbooks} curriculum={curriculum} setCurriculum={setCurriculum} />}
      {tab === "withdrawals" && <AdminWithdrawals withdrawals={withdrawals} setWithdrawals={setWithdrawals} users={users} forceSave={forceSave} />}
      {tab === "access" && cur && cur.role === "admin" && <AdminAccessLogs accessLogs={accessLogs} setAccessLogs={setAccessLogs} forceSave={forceSave} />}
    </div>
  );
}

function AdminStudents({ users, setUsers, allClasses, hideCount, forceSave, allA, sp, scores, attendance, messages, cur, withdrawals, setWithdrawals }) {
  var [wdStudent, setWdStudent] = useState(null);
  var wdCtx = { allA: allA, sp: sp, scores: scores, attendance: attendance, messages: messages, users: users };
  var isWithdrawn = function(sid) { return (withdrawals || []).some(function(w) { return w.studentId === sid; }); };
  var confirmWithdraw = function(rec) {
    setWithdrawals(function(p) { return (p || []).concat([rec]); });
    setWdStudent(null);
    forceSave();
  };
  var undoWithdraw = function(sid) { if (window.confirm("퇴원을 취소(기록 삭제)할까요?")) { setWithdrawals(function(p) { return (p || []).filter(function(w) { return w.studentId !== sid; }); }); forceSave(); } };
  var [showAdd, setShowAdd] = useState(false);
  var [showBulk, setShowBulk] = useState(false);
  var [showEdit, setShowEdit] = useState(null);
  var [cf, setCf] = useState("all");
  var [search, setSearch] = useState("");
  var [nm, setNm] = useState("");
  var [cls, setCls] = useState(allClasses[0] || "A반");
  var [pw, setPw] = useState("1234");
  var [bulkText, setBulkText] = useState("");
  var [bulkClass, setBulkClass] = useState(allClasses[0] || "A반");
  var [bulkPw, setBulkPw] = useState("1234");
  var [bulkPreview, setBulkPreview] = useState([]);
  var [bulkSuccess, setBulkSuccess] = useState("");
  var [bulkMode, setBulkMode] = useState("text");
  var [bulkFileMsg, setBulkFileMsg] = useState("");
  var [bulkRawRows, setBulkRawRows] = useState([]);
  var [bulkNameCol, setBulkNameCol] = useState(0);
  var [bulkClassCol, setBulkClassCol] = useState(-1);
  var [bulkSimplify, setBulkSimplify] = useState(true);

  var simplifyClassName = function(raw) {
    if (!raw) return "";
    // Handle multiple classes (comma + space separated) - take first one
    var parts = raw.split(/,\s*/);
    var cls = parts[0].trim();
    // Remove time info like (4:00~) (8:10~) (5:50~)
    cls = cls.replace(/\d+T\([^)]*\)/g, "").trim();
    cls = cls.replace(/\d+T$/, "").trim();
    // Pattern: LEVEL_TEACHER_DAYS → LEVEL-TEACHER(DAYS)
    var m = cls.match(/^([A-Za-z0-9]+)[_]([가-힣]+)[_]([가-힣]+)/);
    if (m) {
      return m[1] + "-" + m[2] + "(" + m[3] + ")";
    }
    // Already in good format like "E3-수인(화목)" or "개별-수오(월수금)"
    if (/^[A-Za-z0-9가-힣]+-[가-힣]+\(/.test(cls)) return cls;
    return cls;
  };
  var [editNm, setEditNm] = useState("");
  var [editCls, setEditCls] = useState("");
  var [editPw, setEditPw] = useState("");

  var students = users.filter(function(u) { return u.role === "student"; });
  var classes = allClasses;

  var filtered = students.filter(function(s) {
    if (cf !== "all" && s.classId !== cf) return false;
    if (search && s.name.indexOf(search) === -1) return false;
    return true;
  });

  var addSingle = function() {
    if (!nm.trim()) return;
    var av = STU_AVATARS[Math.floor(Math.random() * STU_AVATARS.length)];
    setUsers(function(p) { return p.concat([{ id: "stu_" + mkid(), name: nm.trim(), role: "student", password: pw || "1234", classId: cls, avatar: av }]); });
    setNm(""); setPw("1234"); setShowAdd(false); forceSave();
  };

  var parseBulk = function(text) {
    return text.split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; }).map(function(n, i) {
      return { name: n, avatar: STU_AVATARS[i % STU_AVATARS.length], classId: bulkClass, password: bulkPw || "1234" };
    });
  };

  var parseExcelRows = function(rows, nCol, cCol) {
    if (!rows || rows.length === 0) return [];

    // Find header row by searching first 15 rows
    var headerRow = -1;
    var nameWords = ["이름", "학생명", "성명", "name", "학생이름"];
    var classWords = ["반명", "반", "클래스", "class", "소속"];
    var detectedNameCol = nCol, detectedClassCol = cCol;

    for (var h = 0; h < Math.min(15, rows.length); h++) {
      var row = rows[h];
      if (!row) continue;
      for (var ci = 0; ci < row.length; ci++) {
        var val = String(row[ci] || "").trim().toLowerCase();
        if (nameWords.indexOf(val) >= 0) {
          headerRow = h;
          detectedNameCol = ci;
        }
        if (classWords.indexOf(val) >= 0) {
          detectedClassCol = ci;
        }
      }
      if (headerRow === h) break;
    }

    // If explicit columns provided (user selected), use those
    if (nCol !== undefined && nCol >= 0) detectedNameCol = nCol;
    if (cCol !== undefined && cCol >= 0) detectedClassCol = cCol;

    var startRow = headerRow >= 0 ? headerRow + 1 : 0;
    var results = [];
    var seen = {};
    var skipPatterns = ["학생인원", "data download", "download", "학생명", "이름", "반명", "성명"];

    for (var i = startRow; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.length === 0) continue;
      var nameVal = String(row[detectedNameCol] || "").trim();
      if (!nameVal) continue;
      if (/^[0-9]+$/.test(nameVal)) continue;
      var lower = nameVal.toLowerCase();
      var skip = false;
      skipPatterns.forEach(function(p) { if (lower.indexOf(p) >= 0) skip = true; });
      if (skip) continue;
      if (seen[nameVal]) continue;
      seen[nameVal] = true;
      var classVal = (detectedClassCol >= 0 && row[detectedClassCol]) ? String(row[detectedClassCol]).trim() : "";
      if (classVal && bulkSimplify) classVal = simplifyClassName(classVal);
      results.push({
        name: nameVal,
        classId: classVal || bulkClass,
        avatar: STU_AVATARS[results.length % STU_AVATARS.length],
        password: bulkPw || "1234"
      });
    }
    return results;
  };

  var applyColumns = function() {
    var parsed = parseExcelRows(bulkRawRows, bulkNameCol, bulkClassCol);
    setBulkPreview(parsed);
    var classCount = {};
    parsed.forEach(function(p) { classCount[p.classId] = (classCount[p.classId] || 0) + 1; });
    var classInfo = Object.keys(classCount).sort().slice(0, 5).map(function(c) { return c.substring(0, 12) + " " + classCount[c] + "명"; }).join(", ");
    var extra = Object.keys(classCount).length > 5 ? " 외 " + (Object.keys(classCount).length - 5) + "개" : "";
    setBulkFileMsg(parsed.length + "명, " + Object.keys(classCount).length + "개 반 (" + classInfo + extra + ")");
  };

  var addBulk = function() {
    var items = bulkPreview;
    if (items.length === 0) return;
    var newUsers = items.map(function(item) {
      return { id: "stu_" + mkid() + Math.random().toString(36).slice(2, 4), name: item.name, role: "student", password: item.password, classId: item.classId, avatar: item.avatar };
    });
    setUsers(function(p) { return p.concat(newUsers); });
    setBulkSuccess(newUsers.length + "명의 학생이 추가되었습니다!");
    setBulkText(""); setBulkPreview([]);
    setTimeout(function() { setBulkSuccess(""); setShowBulk(false); setBulkMode("text"); setBulkFileMsg(""); }, 2000);
    forceSave();
  };

  var openEdit = function(s) { setShowEdit(s.id); setEditNm(s.name); setEditCls(s.classId); setEditPw(s.password); };
  var saveEdit = function() {
    if (!editNm.trim()) return;
    setUsers(function(p) { return p.map(function(u) { return u.id === showEdit ? Object.assign({}, u, { name: editNm.trim(), classId: editCls, password: editPw || "1234" }) : u; }); });
    setShowEdit(null); forceSave();
  };

  var downloadExcel = function() {
    var rows = [["번호", "이름", "반", "비밀번호"]];
    students.forEach(function(s, i) {
      rows.push([(i + 1).toString(), s.name, s.classId, s.password]);
    });
    var csvContent = "\uFEFF"; // UTF-8 BOM for Korean in Excel
    rows.forEach(function(row) {
      csvContent += row.map(function(cell) { return '"' + cell.replace(/"/g, '""') + '"'; }).join(",") + "\n";
    });
    var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ROUTETOP_학생명단_" + new Date().toISOString().split("T")[0] + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>학생 목록</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!hideCount && students.length > 0 && <button className="btn btn-g btn-s" style={{ color: "#dc2626", borderColor: "#fecaca" }} onClick={function() { if (window.confirm("학생 " + students.length + "명을 전부 삭제할까요?\n\n⚠️ 이 작업은 되돌릴 수 없습니다!")) { if (window.confirm("정말로 전체 삭제하시겠습니까? 마지막 확인입니다.")) { setUsers(function(p) { return p.filter(function(u) { return u.role !== "student"; }); }); forceSave(); } } }}>🗑 전체 삭제</button>}
          {!hideCount && <button className="btn btn-g btn-s" onClick={downloadExcel}>📥 엑셀 다운</button>}
          {!hideCount && <button className="btn btn-ok btn-s" onClick={function() { setBulkMode("excel"); setShowBulk(true); }}>📊 엑셀 업로드</button>}
          {!hideCount && <button className="btn btn-ok btn-s" onClick={function() { setBulkMode("text"); setShowBulk(true); }}>📋 한꺼번에 등록</button>}
          {!hideCount && <button className="btn btn-p btn-s" onClick={function() { setShowAdd(true); }}>+ 학생 추가</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="fb" style={{ marginBottom: 0 }}>
          <button className={cn("fc", cf === "all" && "on")} onClick={function() { setCf("all"); }}>전체</button>
          {classes.map(function(c) { var cnt = students.filter(function(s) { return s.classId === c; }).length; return <button key={c} className={cn("fc", cf === c && "on")} onClick={function() { setCf(c); }}>{c} ({cnt})</button>; })}
        </div>
        {(!hideCount || cf !== "all") && <input value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="🔍 이름 검색..." style={{ padding: "5px 12px", border: "2px solid var(--bdr)", borderRadius: 18, fontSize: 11, fontFamily: "Noto Sans KR", width: 140 }} />}
      </div>

      {hideCount && cf === "all" && <div style={{ padding: 20, textAlign: "center", background: "#f9fafb", borderRadius: "var(--r)", marginTop: 10 }}><div style={{ fontSize: 30, marginBottom: 8 }}>🏫</div><div style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 600 }}>반을 선택하면 학생 목록이 표시됩니다</div></div>}

      {(!hideCount || cf !== "all") && (filtered.length === 0 ? <div className="empty"><div className="eic">🎒</div><p>등록된 학생이 없습니다</p></div> :
        <div className="stu-grid">
          {filtered.map(function(s) {
            var wd = isWithdrawn(s.id);
            return (
              <div key={s.id} className="stu-card" style={wd ? { opacity: 0.6 } : null}>
                <div className="stu-card-av">{s.avatar}</div>
                <div className="stu-card-info"><div className="stu-card-name">{s.name}{wd && <span style={{ fontSize: 9, fontWeight: 800, color: "#dc2626", background: "#fef2f2", borderRadius: 8, padding: "1px 6px", marginLeft: 6 }}>퇴원</span>}</div><div className="stu-card-meta">{s.classId}{!hideCount && " · 비번: " + s.password}</div></div>
                <div className="stu-card-actions">
                  {!hideCount && !wd && <button className="btn btn-g btn-s" onClick={function() { openEdit(s); }}>수정</button>}
                  {wd ? <button className="btn btn-g btn-s" style={{ color: "var(--tx2)" }} onClick={function() { undoWithdraw(s.id); }}>되돌리기</button>
                      : <button className="btn btn-g btn-s" style={{ color: "#dc2626", borderColor: "#fecaca" }} onClick={function() { setWdStudent(s); }}>🚪 퇴원</button>}
                  {!hideCount && !wd && <button className="btn-d" style={{ fontSize: 14 }} onClick={function() { if (window.confirm("삭제할까요?")) { setUsers(function(p) { return p.filter(function(u) { return u.id !== s.id; }); }); forceSave(); } }}>✕</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {wdStudent && <WithdrawalModal student={wdStudent} ctx={wdCtx} cur={cur} onClose={function() { setWdStudent(null); }} onConfirm={confirmWithdraw} />}

      {!hideCount && <div className="hint" style={{ marginTop: 16 }}>💡 "한꺼번에 등록"으로 엑셀 파일을 업로드하거나 이름을 직접 입력하여 한 번에 등록할 수 있습니다.</div>}

      {showAdd && <div className="mo" onClick={function() { setShowAdd(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }}>
        <h3>🎒 학생 추가</h3>
        <div className="fg"><label>이름 *</label><input value={nm} onChange={function(e) { setNm(e.target.value); }} placeholder="학생 이름" /></div>
        <div className="row2">
          <ClassSelect value={cls} onChange={setCls} classes={classes} label="반" editKey={"add"} />
          <div className="fg"><label>비밀번호</label><input value={pw} onChange={function(e) { setPw(e.target.value); }} /></div>
        </div>
        <div className="br"><button className="btn btn-g" onClick={function() { setShowAdd(false); }}>취소</button><button className="btn btn-p" onClick={addSingle}>추가</button></div>
      </div></div>}

      {showBulk && <div className="mo" onClick={function() { setShowBulk(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 560 }}>
        <h3>📋 한꺼번에 학생 등록</h3>
        {bulkSuccess && <div style={{ padding: 12, background: "var(--okb)", border: "1px solid #a7f3d0", borderRadius: "var(--rs)", fontSize: 12, color: "#065f46", marginBottom: 12 }}>✅ {bulkSuccess}</div>}
        <div className="row2">
          <ClassSelect value={bulkClass} onChange={setBulkClass} classes={classes} label={bulkMode === "excel" ? "기본 반 (B열 없을 때)" : "반"} editKey={"bulk"} />
          <div className="fg"><label>공통 비밀번호</label><input value={bulkPw} onChange={function(e) { setBulkPw(e.target.value); }} /></div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" className={cn("fc", bulkMode === "text" && "on")} onClick={function() { setBulkMode("text"); }}>✏️ 직접 입력</button>
          <button type="button" className={cn("fc", bulkMode === "excel" && "on")} onClick={function() { setBulkMode("excel"); }}>📊 엑셀 업로드</button>
        </div>

        {bulkMode === "text" && <div className="fg"><label>학생 이름 (한 줄에 한 명씩)</label><textarea value={bulkText} onChange={function(e) { setBulkText(e.target.value); setBulkPreview(parseBulk(e.target.value)); }} placeholder={"홍길동\n김철수\n이영희"} /></div>}

        {bulkMode === "excel" && <div>
          <div className="fg">
            <label>엑셀 파일 선택 (.xlsx, .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={function(e) {
              var file = e.target.files[0];
              if (!file) return;
              var ext = file.name.split(".").pop().toLowerCase();

              var processRows = function(rows) {
                setBulkRawRows(rows);
                // Search first 15 rows for header row containing 학생명/이름 and 반명/반
                var nc = 0, cc = -1;
                var nameWords = ["이름", "학생명", "성명", "name"];
                var classWords = ["반명", "반", "클래스", "class"];
                for (var h = 0; h < Math.min(15, rows.length); h++) {
                  if (!rows[h]) continue;
                  for (var ci = 0; ci < rows[h].length; ci++) {
                    var val = String(rows[h][ci] || "").trim().toLowerCase();
                    if (nameWords.indexOf(val) >= 0) nc = ci;
                    if (classWords.indexOf(val) >= 0) cc = ci;
                  }
                  if (nc > 0 || cc >= 0) break;
                }
                setBulkNameCol(nc);
                setBulkClassCol(cc);
                var parsed = parseExcelRows(rows, nc, cc);
                setBulkPreview(parsed);
                var classCount = {};
                parsed.forEach(function(p) { classCount[p.classId] = (classCount[p.classId] || 0) + 1; });
                var classInfo = Object.keys(classCount).sort().slice(0, 5).map(function(c) { return c.substring(0, 12) + " " + classCount[c] + "명"; }).join(", ");
                var extra = Object.keys(classCount).length > 5 ? " 외 " + (Object.keys(classCount).length - 5) + "개 반" : "";
                setBulkFileMsg(parsed.length + "명, " + Object.keys(classCount).length + "개 반 (" + classInfo + extra + ")");
              };

              if (ext === "csv" || ext === "txt") {
                var reader = new FileReader();
                reader.onload = function(ev) {
                  var text = ev.target.result;
                  var rows = text.split("\n").map(function(l) { return l.trim().replace(/"/g, "").split(",").map(function(c) { return c.trim(); }); }).filter(function(r) { return r.length > 0 && r[0]; });
                  processRows(rows);
                };
                reader.readAsText(file, "UTF-8");
              } else {
                var loadXLSX = function() {
                  return new Promise(function(resolve, reject) {
                    if (window.XLSX) { resolve(window.XLSX); return; }
                    var script = document.createElement("script");
                    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                    script.onload = function() { resolve(window.XLSX); };
                    script.onerror = function() { reject(new Error("XLSX 로드 실패")); };
                    document.head.appendChild(script);
                  });
                };
                var reader2 = new FileReader();
                reader2.onload = function(ev) {
                  loadXLSX().then(function(XLSX) {
                    var data = new Uint8Array(ev.target.result);
                    var wb = XLSX.read(data, { type: "array" });
                    var ws = wb.Sheets[wb.SheetNames[0]];
                    var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                    processRows(rows);
                  }).catch(function() {
                    setBulkFileMsg("엑셀 파일 읽기 실패. CSV로 저장 후 다시 시도해주세요.");
                  });
                };
                reader2.readAsArrayBuffer(file);
              }
            }} style={{ padding: "10px", border: "2px dashed var(--bdr)", borderRadius: "var(--rs)", width: "100%", fontSize: 12, fontFamily: "Noto Sans KR", cursor: "pointer", background: "#f9fafb" }} />
          </div>
          {bulkFileMsg && <div style={{ padding: 8, background: "#eff6ff", borderRadius: "var(--rs)", fontSize: 11, color: "#1e40af", marginBottom: 10 }}>📊 {bulkFileMsg}</div>}

          {bulkRawRows.length > 0 && <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>📋 엑셀 데이터 미리보기 (처음 3줄):</div>
            <div style={{ background: "#f9fafb", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", padding: 8, fontSize: 10, overflowX: "auto", marginBottom: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr>
                {(bulkRawRows[0] || []).map(function(_, ci) { return <th key={ci} style={{ padding: "4px 8px", border: "1px solid #e5e7eb", background: "#f3f4f6", fontWeight: 700 }}>{String.fromCharCode(65 + ci)}열</th>; })}
              </tr></thead><tbody>
                {bulkRawRows.slice(0, 3).map(function(row, ri) { return <tr key={ri}>{(row || []).map(function(cell, ci) { return <td key={ci} style={{ padding: "4px 8px", border: "1px solid #e5e7eb" }}>{String(cell || "")}</td>; })}</tr>; })}
              </tbody></table>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>📌 이름이 있는 열</label>
                <select value={bulkNameCol} onChange={function(e) { var nc = Number(e.target.value); setBulkNameCol(nc); var parsed = parseExcelRows(bulkRawRows, nc, bulkClassCol); setBulkPreview(parsed); }} style={{ width: "100%", padding: "6px", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12 }}>
                  {(bulkRawRows[0] || []).map(function(_, ci) { return <option key={ci} value={ci}>{String.fromCharCode(65 + ci)}열 (예: {String(bulkRawRows[0][ci] || "").substring(0, 15)})</option>; })}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>📌 반이 있는 열</label>
                <select value={bulkClassCol} onChange={function(e) { var cc = Number(e.target.value); setBulkClassCol(cc); var parsed = parseExcelRows(bulkRawRows, bulkNameCol, cc); setBulkPreview(parsed); }} style={{ width: "100%", padding: "6px", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12 }}>
                  <option value={-1}>없음 (기본 반 사용)</option>
                  {(bulkRawRows[0] || []).map(function(_, ci) { return <option key={ci} value={ci}>{String.fromCharCode(65 + ci)}열 (예: {String(bulkRawRows[0][ci] || "").substring(0, 15)})</option>; })}
                </select>
              </div>
            </div>
            <button className="btn btn-ok btn-s" onClick={applyColumns} style={{ marginBottom: 10 }}>🔄 열 설정 적용</button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "10px 12px", background: bulkSimplify ? "#eff6ff" : "#f9fafb", border: "1px solid " + (bulkSimplify ? "#bfdbfe" : "var(--bdr)"), borderRadius: "var(--rs)" }}>
              <input type="checkbox" checked={bulkSimplify} onChange={function(e) { setBulkSimplify(e.target.checked); }} id="simplify-cb" style={{ width: 18, height: 18, cursor: "pointer" }} />
              <label htmlFor="simplify-cb" style={{ fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                반 이름 단순화 (예: E3_수인_화목1T(4:00~) → E3-수인(화목))
              </label>
            </div>
          </div>}

          <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>💡 파일 업로드 후 이름/반 열을 직접 선택할 수 있습니다.</div>
        </div>}

        {bulkPreview.length > 0 && <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>미리보기 <span className="bulk-count">{bulkPreview.length}명</span></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {(function() {
              var cc = {};
              bulkPreview.forEach(function(p) { cc[p.classId] = (cc[p.classId] || 0) + 1; });
              return Object.keys(cc).sort().map(function(c) {
                return <span key={c} className="chip" style={{ fontSize: 11, padding: "3px 10px" }}>{c}: {cc[c]}명</span>;
              });
            })()}
          </div>
          <div className="bulk-preview">{bulkPreview.map(function(p, i) { return <div key={i} className="bulk-item"><span>{p.avatar}</span><span style={{ fontWeight: 600 }}>{p.name}</span><span className="chip">{p.classId}</span></div>; })}</div>
        </div>}
        <div className="br"><button className="btn btn-g" onClick={function() { setShowBulk(false); setBulkFileMsg(""); setBulkMode("text"); }}>취소</button><button className="btn btn-p" onClick={function() { addBulk(); setBulkFileMsg(""); }}>{bulkPreview.length}명 등록하기</button></div>
      </div></div>}

      {showEdit && <div className="mo" onClick={function() { setShowEdit(null); }}><div className="md" onClick={function(e) { e.stopPropagation(); }}>
        <h3>✏️ 학생 정보 수정</h3>
        <div className="fg"><label>이름</label><input value={editNm} onChange={function(e) { setEditNm(e.target.value); }} /></div>
        <div className="row2">
          <ClassSelect value={editCls} onChange={setEditCls} classes={classes} label="반" editKey={showEdit} />
          <div className="fg"><label>비밀번호</label><input value={editPw} onChange={function(e) { setEditPw(e.target.value); }} /></div>
        </div>
        <div className="br"><button className="btn btn-g" onClick={function() { setShowEdit(null); }}>취소</button><button className="btn btn-p" onClick={saveEdit}>저장</button></div>
      </div></div>}
    </div>
  );
}

function AdminSettings({ users, setUsers, classList, setClassList, forceSave, hideCount }) {
  var [curPw, setCurPw] = useState("");
  var [newPw, setNewPw] = useState("");
  var [msg, setMsg] = useState("");
  var [newClassName, setNewClassName] = useState("");
  var [classMsg, setClassMsg] = useState("");
  var [editingClass, setEditingClass] = useState(null);
  var [editClassName, setEditClassName] = useState("");
  var admin = users.find(function(u) { return u.role === "admin"; });

  // All classes = registered + from students
  var studentClasses = [];
  users.filter(function(u) { return u.role === "student"; }).forEach(function(s) { if (studentClasses.indexOf(s.classId) === -1) studentClasses.push(s.classId); });
  var allClasses = classList.slice();
  studentClasses.forEach(function(c) { if (allClasses.indexOf(c) === -1) allClasses.push(c); });
  allClasses.sort();

  var changePw = function() {
    if (curPw !== admin.password) { setMsg("❌ 현재 비밀번호가 틀렸습니다"); return; }
    if (newPw.length < 4) { setMsg("❌ 새 비밀번호는 4자 이상이어야 합니다"); return; }
    setUsers(function(p) { return p.map(function(u) { return u.role === "admin" ? Object.assign({}, u, { password: newPw }) : u; }); });
    setMsg("✅ 비밀번호가 변경되었습니다!"); setCurPw(""); setNewPw("");
    setTimeout(function() { setMsg(""); }, 3000);
  };

  var addClass = function() {
    if (!newClassName.trim()) return;
    if (allClasses.indexOf(newClassName.trim()) >= 0) { setClassMsg("❌ 이미 있는 반 이름입니다"); return; }
    setClassList(function(p) { return p.concat([newClassName.trim()]); });
    setClassMsg("✅ " + newClassName.trim() + " 추가 완료!");
    setNewClassName("");
    setTimeout(function() { setClassMsg(""); }, 2000);
  };

  var removeClass = function(name) {
    var count = users.filter(function(u) { return u.role === "student" && u.classId === name; }).length;
    if (count > 0) {
      if (!window.confirm(name + "에 학생 " + count + "명이 있습니다.\n반과 학생을 모두 삭제할까요?")) return;
    }
    setUsers(function(p) { return p.filter(function(u) { return !(u.role === "student" && u.classId === name); }); });
    setClassList(function(p) { return p.filter(function(c) { return c !== name; }); });
    forceSave();
    setClassMsg("✅ " + name + " 삭제 완료");
    setTimeout(function() { setClassMsg(""); }, 2000);
  };

  var renameClass = function(oldName) {
    var newName = editClassName.trim();
    if (!newName) return;
    if (newName === oldName) { setEditingClass(null); return; }
    if (allClasses.indexOf(newName) >= 0) { setClassMsg("❌ '" + newName + "'은 이미 있는 반 이름입니다"); return; }
    // Update classList
    setClassList(function(p) { return p.map(function(c) { return c === oldName ? newName : c; }); });
    // Update all students and instructors
    setUsers(function(p) { return p.map(function(u) {
      var changed = Object.assign({}, u);
      if (u.role === "student" && u.classId === oldName) changed.classId = newName;
      if (u.assignedClasses) changed.assignedClasses = u.assignedClasses.map(function(c) { return c === oldName ? newName : c; });
      return changed;
    }); });
    forceSave();
    setEditingClass(null);
    setClassMsg("✅ " + oldName + " → " + newName + " 변경 완료!");
    setTimeout(function() { setClassMsg(""); }, 2000);
  };

  var removeEmptyClasses = function() {
    var empties = allClasses.filter(function(c) { return users.filter(function(u) { return u.role === "student" && u.classId === c; }).length === 0; });
    if (empties.length === 0) { setClassMsg("❌ 빈 반이 없습니다"); setTimeout(function() { setClassMsg(""); }, 2000); return; }
    if (!window.confirm("학생이 없는 반 " + empties.length + "개를 삭제할까요?")) return;
    setClassList(function(p) { return p.filter(function(c) { return empties.indexOf(c) < 0; }); });
    forceSave();
    setClassMsg("✅ 빈 반 " + empties.length + "개 삭제 완료");
    setTimeout(function() { setClassMsg(""); }, 2000);
  };

  var removeAllClasses = function() {
    if (!window.confirm("모든 반과 학생을 삭제할까요?\n⚠️ 이 작업은 되돌릴 수 없습니다!")) return;
    if (!window.confirm("정말로 전체 삭제하시겠습니까?")) return;
    setUsers(function(p) { return p.filter(function(u) { return u.role !== "student"; }); });
    setClassList(function() { return []; });
    forceSave();
    setClassMsg("✅ 전체 삭제 완료");
    setTimeout(function() { setClassMsg(""); }, 2000);
  };

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>⚙️ 관리자 설정</h3>

      <div className="card" style={{ maxWidth: 550, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          {!hideCount && <div style={{ padding: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "var(--r)", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 4 }}>📊 전체 현황</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12 }}>전체 학생: <span style={{ fontWeight: 800, color: "var(--pri)" }}>{users.filter(function(u){return u.role==="student"}).length}명</span></div>
              <div style={{ fontSize: 12 }}>강사: <span style={{ fontWeight: 800 }}>{users.filter(function(u){return u.role==="instructor"}).length}명</span></div>
              <div style={{ fontSize: 12 }}>학부모: <span style={{ fontWeight: 800 }}>{users.filter(function(u){return u.role==="parent"}).length}명</span></div>
              <div style={{ fontSize: 12 }}>반: <span style={{ fontWeight: 800 }}>{allClasses.length}개</span></div>
            </div>
          </div>}
          <div style={{ fontSize: 14, fontWeight: 700 }}>🏫 반 관리 ({allClasses.length}개)</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-g btn-s" onClick={removeEmptyClasses}>빈 반 정리</button>
            <button className="btn btn-g btn-s" style={{ color: "#dc2626" }} onClick={removeAllClasses}>전체 삭제</button>
          </div>
        </div>
        {classMsg && <div style={{ padding: 10, borderRadius: "var(--rs)", marginBottom: 10, fontSize: 12, fontWeight: 600, background: classMsg.indexOf("✅") >= 0 ? "var(--okb)" : "#fef2f2", color: classMsg.indexOf("✅") >= 0 ? "#065f46" : "#dc2626" }}>{classMsg}</div>}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={newClassName} onChange={function(e) { setNewClassName(e.target.value); setClassMsg(""); }} onKeyDown={function(e) { if (e.key === "Enter") addClass(); }} placeholder="새 반 이름 입력 (예: C반)" style={{ flex: 1, padding: "8px 10px", border: "2px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12, fontFamily: "Noto Sans KR" }} />
          <button className="btn btn-p btn-s" onClick={addClass}>+ 추가</button>
        </div>
        {allClasses.length === 0 ? <div style={{ fontSize: 12, color: "var(--tx2)", padding: 10 }}>등록된 반이 없습니다</div> :
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {allClasses.map(function(c) {
              var count = users.filter(function(u) { return u.role === "student" && u.classId === c; }).length;
              if (editingClass === c) {
                return (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#eff6ff", borderRadius: 20, border: "2px solid #3b82f6" }}>
                    <input value={editClassName} onChange={function(e) { setEditClassName(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") renameClass(c); if (e.key === "Escape") setEditingClass(null); }} autoFocus style={{ width: 120, padding: "3px 6px", border: "1px solid var(--bdr)", borderRadius: 8, fontSize: 11, fontFamily: "Noto Sans KR" }} />
                    <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--ok)", fontWeight: 800 }} onClick={function() { renameClass(c); }}>✓</button>
                    <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--tx2)" }} onClick={function() { setEditingClass(null); }}>✕</button>
                  </div>
                );
              }
              return (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: count > 0 ? "#f3f4f6" : "#fef2f2", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                  <span>{c}</span>
                  <span style={{ fontSize: 10, color: count > 0 ? "var(--tx2)" : "#dc2626" }}>({count}명)</span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#3b82f6", padding: 0 }} onClick={function() { setEditingClass(c); setEditClassName(c); }}>✏️</button>
                  <button className="btn-d" style={{ fontSize: 12, padding: 0, color: "#dc2626" }} onClick={function() { removeClass(c); }}>✕</button>
                </div>
              );
            })}
          </div>
        }
        <div className="hint" style={{ marginTop: 10 }}>💡 학생이 있는 반을 삭제하면 학생도 함께 삭제됩니다. "빈 반 정리"로 학생 없는 반만 한번에 정리할 수 있습니다.</div>
      </div>

      <div className="card" style={{ maxWidth: 450 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🔒 관리자 비밀번호 변경</div>
        {msg && <div style={{ padding: 12, borderRadius: "var(--rs)", marginBottom: 12, fontSize: 12, fontWeight: 600, background: msg.indexOf("✅") >= 0 ? "var(--okb)" : "#fef2f2", color: msg.indexOf("✅") >= 0 ? "#065f46" : "#dc2626" }}>{msg}</div>}
        <div className="fg"><label>현재 비밀번호</label><input type="password" value={curPw} onChange={function(e) { setCurPw(e.target.value); setMsg(""); }} placeholder="현재 비밀번호 입력" /></div>
        <div className="fg"><label>새 비밀번호</label><input type="password" value={newPw} onChange={function(e) { setNewPw(e.target.value); setMsg(""); }} placeholder="새 비밀번호 입력 (4자 이상)" /></div>
        <div className="br"><button className="btn btn-p" onClick={changePw}>비밀번호 변경</button></div>
      </div>
    </div>
  );
}

function AdminStats({ users, allA, sp, hideCount }) {
  var [cf, setCf] = useState("all");
  var [view, setView] = useState("summary");
  var students = users.filter(function(u) { return u.role === "student"; });
  var classes = []; students.forEach(function(s) { if (classes.indexOf(s.classId) === -1) classes.push(s.classId); }); classes.sort();
  var filtered = cf === "all" ? students : students.filter(function(s) { return s.classId === cf; });
  var studentStats = filtered.map(function(s) {
    var rel = allA.filter(function(a) { return a.classId === s.classId; });
    var ti = rel.reduce(function(sum, a) { return sum + a.items.length; }, 0);
    var di = rel.reduce(function(sum, a) { return sum + ((sp[s.id] && sp[s.id][a.id]) ? sp[s.id][a.id].length : 0); }, 0);
    return Object.assign({}, s, { pct: ti === 0 ? 0 : Math.round((di / ti) * 100), totalItems: ti, doneItems: di });
  });
  var completed = studentStats.filter(function(s) { return s.pct === 100; }).length;
  var inProgress = studentStats.filter(function(s) { return s.pct > 0 && s.pct < 100; }).length;
  var notStarted = studentStats.filter(function(s) { return s.pct === 0 && s.totalItems > 0; }).length;
  var barData = studentStats.filter(function(s) { return s.totalItems > 0; }).sort(function(a, b) { return a.pct - b.pct; }).map(function(s) { return { name: s.name, avatar: s.avatar, pct: s.pct }; });
  var segBtn = function(key, label) {
    var on = view === key;
    return <button onClick={function() { setView(key); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: on ? "var(--pri)" : "transparent", color: on ? "#fff" : "var(--tx2)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>{label}</button>;
  };
  return (
    <div>
      <div className="fb"><button className={cn("fc", cf === "all" && "on")} onClick={function() { setCf("all"); }}>전체</button>{classes.map(function(c) { return <button key={c} className={cn("fc", cf === c && "on")} onClick={function() { setCf(c); }}>{c}</button>; })}</div>
      <div style={{ display: "flex", gap: 4, background: "#f1f3f5", borderRadius: 10, padding: 4, marginBottom: 14 }}>
        {segBtn("summary", "📊 요약 (차트)")}
        {segBtn("detail", "📋 상세 (과제별)")}
      </div>
      {view === "summary" ? (
        <>
          {!hideCount && <div className="sg"><div className="sc"><div className="sl">전체 학생</div><div className="sv b">{filtered.length}</div></div><div className="sc"><div className="sl">과제 완료</div><div className="sv g">{completed}명</div></div><div className="sc"><div className="sl">진행중</div><div className="sv a">{inProgress}명</div></div><div className="sc"><div className="sl">미시작</div><div className="sv r">{notStarted}명</div></div></div>}
          <div className="chart-card"><div className="chart-title">📊 전체 완료 현황</div><DonutChart completed={completed} inProgress={inProgress} notStarted={notStarted} total={completed + inProgress + notStarted} /></div>
          {barData.length > 0 && <BarChart data={barData} title="📈 학생별 진행률 (낮은 순)" />}
        </>
      ) : (
        <div className="card"><div className="tw"><table><thead><tr><th>학생</th><th>반</th><th>과제</th><th>진행률</th><th>상태</th></tr></thead><tbody>
          {filtered.map(function(s) {
            var rel = allA.filter(function(a) { return a.classId === s.classId; });
            if (rel.length === 0) return (<tr key={s.id}><td style={{ fontWeight: 600 }}>{s.avatar} {s.name}</td><td><span className="chip">{s.classId}</span></td><td colSpan={3} style={{ color: "var(--tx2)" }}>과제 없음</td></tr>);
            return rel.map(function(a, i) {
              var p = getPct(sp, s.id, a.id, a.items);
              var st = p === 100 ? { l: "완료", c: "var(--ok)", b: "var(--okb)" } : p > 0 ? { l: "진행중", c: "var(--warn)", b: "var(--warnb)" } : { l: "미시작", c: "var(--pri)", b: "var(--prib)" };
              return (<tr key={s.id + "-" + a.id}>{i === 0 && <><td rowSpan={rel.length} style={{ fontWeight: 600, verticalAlign: "middle" }}>{s.avatar} {s.name}</td><td rowSpan={rel.length} style={{ verticalAlign: "middle" }}><span className="chip">{s.classId}</span></td></>}<td style={{ fontSize: 11 }}>{a.title}</td><td style={{ minWidth: 120 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ flex: 1 }}><PBar pct={p} /></div><span style={{ fontSize: 10, fontWeight: 700 }}>{p}%</span></div></td><td><span className="dbadge" style={{ color: st.c, background: st.b }}>{st.l}</span></td></tr>);
            });
          })}
        </tbody></table></div></div>
      )}
    </div>
  );
}

function AdminInstructors({ users, setUsers, forceSave, allClasses, withdrawals }) {
  var evalPlus = function(instId) { return (withdrawals || []).filter(function(w) { return w.teacherId === instId && w.match; }).length; };
  var [show, setShow] = useState(false);
  var [editId, setEditId] = useState(null);
  var [nm, setNm] = useState(""); var [pw, setPw] = useState("1234"); var [selClasses, setSelClasses] = useState([]); var [role, setRole] = useState("instructor");
  var [editNm, setEditNm] = useState(""); var [editPw, setEditPw] = useState(""); var [editClasses, setEditClasses] = useState([]); var [editRole, setEditRole] = useState("instructor");
  var roleOrder = { admin: 0, manager: 1, instructor: 2 };
  var staff = users.filter(function(u) { return u.role === "instructor" || u.role === "manager" || u.role === "admin"; }).slice().sort(function(a, b) { return (roleOrder[a.role] - roleOrder[b.role]) || a.name.localeCompare(b.name); });
  var students = users.filter(function(u) { return u.role === "student"; });
  var classes = allClasses || [];
  var avatarFor = function(r) { return r === "admin" ? "🛡️" : r === "manager" ? "👔" : "📚"; };
  var roleLabel = function(r) { return r === "admin" ? "관리자" : r === "manager" ? "매니저" : "강사"; };
  var roleBadgeBg = function(r) { return r === "admin" ? "#fef2f4" : r === "manager" ? "#eff6ff" : "#ecfdf5"; };
  var roleBadgeFg = function(r) { return r === "admin" ? "#e94560" : r === "manager" ? "#1e40af" : "#065f46"; };

  var toggleClass = function(list, setList, cls) {
    if (list.indexOf(cls) >= 0) setList(list.filter(function(c) { return c !== cls; }));
    else setList(list.concat([cls]));
  };

  var autoAssign = function(instName) {
    // Extract each character from instructor name
    var chars = instName.split("");
    var matched = [];
    classes.forEach(function(cls) {
      // Extract the character after "수" in class name (e.g., "E3-수인(화목)" → "인")
      var m = cls.match(/수([가-힣])/);
      if (m) {
        var targetChar = m[1];
        if (chars.indexOf(targetChar) >= 0) {
          matched.push(cls);
        }
      }
    });
    return matched;
  };

  var add = function() { if (!nm.trim()) return; var finalClasses = role === "instructor" ? (selClasses.length > 0 ? selClasses : autoAssign(nm.trim())) : []; var idp = role === "admin" ? "adm_" : role === "manager" ? "mgr_" : "inst_"; setUsers(function(p) { return p.concat([{ id: idp + mkid(), name: nm.trim(), role: role, password: pw || "1234", avatar: avatarFor(role), assignedClasses: finalClasses }]); }); setNm(""); setPw("1234"); setSelClasses([]); setRole("instructor"); setShow(false); forceSave(); };
  var openEdit = function(u) { setEditId(u.id); setEditNm(u.name); setEditPw(u.password); setEditClasses(u.assignedClasses || []); setEditRole(u.role || "instructor"); };
  var saveEdit = function() { if (!editNm.trim()) return; setUsers(function(p) { return p.map(function(u) { return u.id === editId ? Object.assign({}, u, { name: editNm.trim(), password: editPw || "1234", role: editRole, avatar: avatarFor(editRole), assignedClasses: editRole === "instructor" ? editClasses : [] }) : u; }); }); setEditId(null); forceSave(); };
  var delInst = function(uid) { var t = users.find(function(x) { return x.id === uid; }); if (t && t.role === "admin" && users.filter(function(x) { return x.role === "admin"; }).length <= 1) { window.alert("마지막 관리자 계정은 삭제할 수 없습니다."); return; } if (window.confirm("이 계정을 삭제하시겠습니까?")) { setUsers(function(p) { return p.filter(function(x) { return x.id !== uid; }); }); forceSave(); } };

  var autoAssignAll = function() {
    setUsers(function(p) {
      return p.map(function(u) {
        if (u.role !== "instructor") return u;
        var matched = autoAssign(u.name);
        if (matched.length > 0) return Object.assign({}, u, { assignedClasses: matched });
        return u;
      });
    });
    forceSave();
  };

  var classSelector = function(selected, setSelected) {
    return (
      <div className="fg">
        <label>담당 반 (클릭하여 선택)</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8, border: "1px solid var(--bdr)", borderRadius: "var(--rs)", minHeight: 36, background: "#f9fafb" }}>
          {classes.length === 0 ? <span style={{ fontSize: 11, color: "var(--tx2)" }}>등록된 반이 없습니다</span> :
            classes.map(function(c) {
              var isOn = selected.indexOf(c) >= 0;
              var cnt = students.filter(function(s) { return s.classId === c; }).length;
              return <button type="button" key={c} onClick={function() { toggleClass(selected, setSelected, c); }} style={{ padding: "4px 10px", borderRadius: 16, border: isOn ? "2px solid var(--ok)" : "1px solid var(--bdr)", background: isOn ? "var(--okb)" : "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", color: isOn ? "#065f46" : "var(--tx2)" }}>{c} ({cnt}){isOn && " ✓"}</button>;
            })
          }
        </div>
        {selected.length > 0 && <div style={{ fontSize: 10, color: "var(--ok)", marginTop: 4, fontWeight: 600 }}>선택: {selected.join(", ")}</div>}
      </div>
    );
  };

  var roleSelector = function(curR, setCurR) {
    return (
      <div className="fg"><label>역할</label>
        <div style={{ display: "flex", gap: 6 }}>
          {[["instructor", "📚 강사"], ["manager", "👔 매니저"], ["admin", "🛡️ 관리자"]].map(function(r) {
            var on = curR === r[0];
            return <button type="button" key={r[0]} onClick={function() { setCurR(r[0]); }} style={{ flex: 1, padding: "9px 4px", borderRadius: 8, border: on ? "2px solid var(--pri)" : "1px solid var(--bdr)", background: on ? "var(--prib)" : "#fff", fontSize: 12, fontWeight: 700, color: on ? "var(--pri)" : "var(--tx2)", cursor: "pointer", fontFamily: "'Noto Sans KR'" }}>{r[1]}</button>;
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}><h3 style={{ fontSize: 15, fontWeight: 700 }}>강사·직원 목록 ({staff.length}명)</h3><div style={{ display: "flex", gap: 6 }}><button className="btn btn-ok btn-s" onClick={autoAssignAll}>🔄 자동 배정</button><button className="btn btn-p btn-s" onClick={function() { setShow(true); }}>+ 직원 추가</button></div></div>
      <div className="hint" style={{ marginBottom: 12 }}>💡 역할로 계정 종류를 지정합니다. 예: 이영민 → 관리자, 이선희 → 매니저. 담당 반은 강사에게만 적용됩니다.</div>
      {staff.length === 0 ? <div className="empty"><p>등록된 직원이 없습니다</p></div> :
        <div>{staff.map(function(u) {
          var ac = u.assignedClasses || [];
          var removeClassFromInst = function(cls) {
            setUsers(function(p) { return p.map(function(x) {
              if (x.id !== u.id) return x;
              return Object.assign({}, x, { assignedClasses: (x.assignedClasses || []).filter(function(c) { return c !== cls; }) });
            }); }); forceSave();
          };
          return (
            <div key={u.id} className="card" style={{ marginBottom: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{u.avatar}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>{u.name}<span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: roleBadgeBg(u.role), color: roleBadgeFg(u.role) }}>{roleLabel(u.role)}</span>{u.role === "instructor" && evalPlus(u.id) > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#065f46", background: "#d1fae5", borderRadius: 10, padding: "1px 7px" }}>진단일치 +{evalPlus(u.id)}</span>}</div>
                  <div style={{ fontSize: 10, color: "var(--tx2)" }}>비밀번호: {u.password}</div>
                </div>
                <button className="btn btn-ok btn-s" onClick={function() { openEdit(u); }}>✏️ 수정</button>
                <button className="btn-d" onClick={function() { delInst(u.id); }}>✕</button>
              </div>
              {u.role === "instructor" && ac.length > 0 && <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {ac.map(function(c) { return <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "#eff6ff", borderRadius: 12, fontSize: 10, fontWeight: 600, color: "#1e40af" }}>{c}<button onClick={function() { removeClassFromInst(c); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#dc2626", padding: 0, fontWeight: 800 }}>✕</button></span>; })}
                <button onClick={function() { openEdit(u); }} style={{ padding: "3px 8px", background: "#f3f4f6", borderRadius: 12, fontSize: 10, border: "1px dashed var(--bdr)", cursor: "pointer", color: "var(--tx2)" }}>+ 반 추가</button>
              </div>}
              {u.role === "instructor" && ac.length === 0 && <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 10, color: "var(--pri)" }}>⚠️ 담당 반 미배정</span><button className="btn btn-ok btn-s" style={{ fontSize: 10, padding: "2px 8px" }} onClick={function() { var matched = autoAssign(u.name); if (matched.length > 0) { setUsers(function(p) { return p.map(function(x) { return x.id === u.id ? Object.assign({}, x, { assignedClasses: matched }) : x; }); }); forceSave(); } else { openEdit(u); } }}>🔍 자동 감지</button></div>}
            </div>
          );
        })}</div>}
      {show && <div className="mo" onClick={function() { setShow(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 500 }}><h3>직원 추가</h3><div className="fg"><label>이름</label><input value={nm} onChange={function(e) { setNm(e.target.value); }} placeholder="이름" /></div><div className="fg"><label>비밀번호</label><input value={pw} onChange={function(e) { setPw(e.target.value); }} /></div>{roleSelector(role, setRole)}{role === "instructor" && <>{nm.trim() && <button className="btn btn-ok btn-s" style={{ marginBottom: 8 }} onClick={function() { setSelClasses(autoAssign(nm.trim())); }}>🔍 이름으로 반 자동 감지</button>}{classSelector(selClasses, setSelClasses)}</>}<div className="br"><button className="btn btn-g" onClick={function() { setShow(false); }}>취소</button><button className="btn btn-p" onClick={add}>추가</button></div></div></div>}
      {editId && <div className="mo" onClick={function() { setEditId(null); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 500 }}><h3>✏️ 직원 정보 수정</h3><div className="fg"><label>이름</label><input value={editNm} onChange={function(e) { setEditNm(e.target.value); }} /></div><div className="fg"><label>비밀번호</label><input value={editPw} onChange={function(e) { setEditPw(e.target.value); }} /></div>{roleSelector(editRole, setEditRole)}{editRole === "instructor" && <><button className="btn btn-ok btn-s" style={{ marginBottom: 8 }} onClick={function() { setEditClasses(autoAssign(editNm.trim())); }}>🔍 이름으로 반 자동 감지</button>{classSelector(editClasses, setEditClasses)}</>}<div className="br"><button className="btn btn-g" onClick={function() { setEditId(null); }}>취소</button><button className="btn btn-p" onClick={saveEdit}>저장</button></div></div></div>}
    </div>
  );
}

function AdminTextbooks({ textbooks, setTextbooks }) {
  var [show, setShow] = useState(false); var [editId, setEditId] = useState(null);
  var [nm, setNm] = useState(""); var [subj, setSubj] = useState(""); var [icon, setIcon] = useState("📘"); var [color, setColor] = useState("#3b82f6");
  var [chapters, setChapters] = useState([{ title: "", lessons: [{ title: "", pages: "", tasks: [""] }] }]);
  var [expTb, setExpTb] = useState(null);
  var reset = function() { setNm(""); setSubj(""); setIcon("📘"); setColor("#3b82f6"); setChapters([{ title: "", lessons: [{ title: "", pages: "", tasks: [""] }] }]); setEditId(null); };
  var openEdit = function(tb) { setEditId(tb.id); setNm(tb.name); setSubj(tb.subject); setIcon(tb.icon); setColor(tb.color); setChapters(tb.chapters.map(function(ch) { return { title: ch.title, lessons: ch.lessons.map(function(l) { return { title: l.title, pages: l.pages, tasks: l.tasks.slice() }; }) }; })); setShow(true); };
  var save = function() { if (!nm.trim() || !subj.trim()) return; var built = { id: editId || "tb_" + mkid(), name: nm.trim(), subject: subj.trim(), icon: icon, color: color, chapters: chapters.filter(function(ch) { return ch.title.trim(); }).map(function(ch, ci) { return { id: "ch" + (ci + 1), title: ch.title.trim(), lessons: ch.lessons.filter(function(l) { return l.title.trim(); }).map(function(l, li) { return { id: "ls" + (li + 1), title: l.title.trim(), pages: l.pages.trim(), tasks: l.tasks.filter(function(t) { return t.trim(); }) }; }) }; }) }; if (editId) setTextbooks(function(p) { return p.map(function(t) { return t.id === editId ? built : t; }); }); else setTextbooks(function(p) { return p.concat([built]); }); setShow(false); reset(); };
  var updCh = function(ci, v) { setChapters(function(p) { var n = p.slice(); n[ci] = Object.assign({}, n[ci], { title: v }); return n; }); };
  var updLs = function(ci, li, k, v) { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); n[ci].lessons[li][k] = v; return n; }); };
  var updTask = function(ci, li, ti, v) { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); n[ci].lessons[li].tasks[ti] = v; return n; }); };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><h3 style={{ fontSize: 15, fontWeight: 700 }}>교재 목록 ({textbooks.length}권)</h3><button className="btn btn-p btn-s" onClick={function() { reset(); setShow(true); }}>+ 교재 추가</button></div>
      {textbooks.map(function(tb) { var op = expTb === tb.id; var totalL = tb.chapters.reduce(function(s, c) { return s + c.lessons.length; }, 0);
        return (<div key={tb.id} className="tb-card"><div className="tb-head" onClick={function() { setExpTb(op ? null : tb.id); }}><div className="tb-icon" style={{ background: tb.color + "18", color: tb.color }}>{tb.icon}</div><div style={{ flex: 1 }}><div className="tb-name">{tb.name}</div><div className="tb-sub">{tb.subject} · {tb.chapters.length}단원 · {totalL}차시</div></div><button className="btn btn-g btn-s" onClick={function(e) { e.stopPropagation(); openEdit(tb); }}>수정</button><button className="btn-d" onClick={function(e) { e.stopPropagation(); setTextbooks(function(p) { return p.filter(function(t) { return t.id !== tb.id; }); }); }}>✕</button><span className={cn("exp", op && "op")}>▼</span></div>
          {op && (<div className="tb-body">
            <div style={{ marginBottom: 10 }}><button className="btn btn-ok btn-s" onClick={function() {
              var html = '<html><head><meta charset="utf-8"><title>' + tb.name + '</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#333}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:16px;color:#555;margin-top:20px;margin-bottom:8px}h3{font-size:13px;margin:12px 0 6px;padding:6px 10px;background:#f3f4f6;border-radius:4px}.task{padding:6px 0 6px 20px;font-size:12px;border-bottom:1px dotted #ddd}.task:before{content:"☐ ";font-size:14px}.pages{font-size:11px;color:#888;margin-left:10px}.lesson-num{font-weight:800;color:#e63946;margin-right:6px}@media print{body{padding:10px}}</style></head><body>';
              html += '<h1>' + tb.icon + ' ' + tb.name + '</h1>';
              tb.chapters.forEach(function(ch) {
                html += '<h2>' + ch.title + '</h2>';
                ch.lessons.forEach(function(ls, li) {
                  html += '<h3><span class="lesson-num">' + (li + 1) + '차시</span>' + ls.title + '<span class="pages">' + ls.pages + '</span></h3>';
                  ls.tasks.forEach(function(t) { html += '<div class="task">' + t + '</div>'; });
                });
              });
              html += '<div style="margin-top:30px;text-align:center;font-size:10px;color:#aaa">ROUTETOP 과제 관리 시스템</div></body></html>';
              var w = window.open('', '_blank');
              w.document.write(html);
              w.document.close();
              w.print();
            }}>🖨️ 프린트</button></div>
            {tb.chapters.map(function(ch) { return (<div key={ch.id}><div className="ch-title">{ch.title}</div>{ch.lessons.map(function(ls, li) { return (<div key={ls.id}><div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 4px", fontSize: 12 }}><span style={{ fontSize: 10, fontWeight: 800, color: "var(--pri)", minWidth: 36 }}>{li + 1}차시</span><span style={{ fontWeight: 600 }}>{ls.title}</span><span style={{ color: "var(--tx2)", fontSize: 10 }}>{ls.pages}</span></div><div className="ls-tasks">{ls.tasks.map(function(t, i) { return <span key={i}>📌 {t}</span>; })}</div></div>); })}</div>); })}</div>)}</div>);
      })}
      {show && (<div className="mo" onClick={function() { setShow(false); reset(); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 620 }}>
        <h3>{editId ? "교재 수정" : "교재 추가"}</h3>
        <div className="row2"><div className="fg"><label>교재명 *</label><input value={nm} onChange={function(e) { setNm(e.target.value); }} /></div><div className="fg"><label>과목 *</label><input value={subj} onChange={function(e) { setSubj(e.target.value); }} /></div></div>
        <div className="row2"><div className="fg"><label>아이콘</label><input value={icon} onChange={function(e) { setIcon(e.target.value); }} /></div><div className="fg"><label>색상</label><input type="color" value={color} onChange={function(e) { setColor(e.target.value); }} style={{ height: 36 }} /></div></div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, marginBottom: 8 }}>📖 단원 / 차시 / 과제</div>
        {chapters.map(function(ch, ci) { return (<div key={ci} style={{ border: "1px solid var(--bdr)", borderRadius: "var(--rs)", padding: 12, marginBottom: 10, background: "#fafaf8" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}><input value={ch.title} onChange={function(e) { updCh(ci, e.target.value); }} placeholder={(ci + 1) + "단원 제목"} style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--bdr)", borderRadius: 4, fontSize: 12, fontFamily: "Noto Sans KR" }} />{chapters.length > 1 && <button className="btn-d" onClick={function() { setChapters(function(p) { return p.filter(function(_, i) { return i !== ci; }); }); }}>✕</button>}</div>
          {ch.lessons.map(function(ls, li) { return (<div key={li} style={{ marginLeft: 12, marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid var(--bdr)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--pri)", minWidth: 36 }}>{li + 1}차시</span>
              <input value={ls.title} onChange={function(e) { updLs(ci, li, "title", e.target.value); }} placeholder="차시 제목" style={{ flex: 1, padding: "5px 7px", border: "1px solid var(--bdr)", borderRadius: 4, fontSize: 11, fontFamily: "Noto Sans KR" }} />
              <input value={ls.pages} onChange={function(e) { updLs(ci, li, "pages", e.target.value); }} placeholder="페이지" style={{ width: 70, padding: "5px 7px", border: "1px solid var(--bdr)", borderRadius: 4, fontSize: 11, fontFamily: "Noto Sans KR" }} />
              {li > 0 && <button title="위로" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 2 }} onClick={function() { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); var tmp = n[ci].lessons[li]; n[ci].lessons[li] = n[ci].lessons[li - 1]; n[ci].lessons[li - 1] = tmp; return n; }); }}>▲</button>}
              {li < ch.lessons.length - 1 && <button title="아래로" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 2 }} onClick={function() { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); var tmp = n[ci].lessons[li]; n[ci].lessons[li] = n[ci].lessons[li + 1]; n[ci].lessons[li + 1] = tmp; return n; }); }}>▼</button>}
              {ch.lessons.length > 1 && <button className="btn-d" onClick={function() { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); n[ci].lessons.splice(li, 1); return n; }); }}>✕</button>}
            </div>
            {ls.tasks.map(function(t, ti) { return (<div key={ti} style={{ display: "flex", gap: 6, marginBottom: 4, marginLeft: 42 }}><input value={t} onChange={function(e) { updTask(ci, li, ti, e.target.value); }} placeholder={"과제 " + (ti + 1)} style={{ flex: 1, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 10, fontFamily: "Noto Sans KR" }} />{ls.tasks.length > 1 && <button className="btn-d" onClick={function() { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); n[ci].lessons[li].tasks.splice(ti, 1); return n; }); }}>✕</button>}</div>); })}
            <div style={{ marginLeft: 42 }}><button className="btn btn-g btn-s" onClick={function() { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); n[ci].lessons[li].tasks.push(""); return n; }); }}>+ 과제항목</button></div>
            <div style={{ margin: "6px 0 2px 0", textAlign: "center" }}><button onClick={function() { setChapters(function(p) { var n = JSON.parse(JSON.stringify(p)); n[ci].lessons.splice(li + 1, 0, { title: "", pages: "", tasks: [""] }); return n; }); }} style={{ background: "none", border: "1px dashed #d1d5db", borderRadius: 4, padding: "2px 10px", fontSize: 10, color: "var(--tx2)", cursor: "pointer", fontFamily: "Noto Sans KR" }}>+ 여기에 차시 삽입</button></div>
          </div>); })}
          <button className="btn btn-ok btn-s" onClick={function() { setChapters(function(p) { var n = p.slice(); n[ci] = Object.assign({}, n[ci], { lessons: n[ci].lessons.concat([{ title: "", pages: "", tasks: [""] }]) }); return n; }); }}>+ 차시 추가 ({ch.lessons.length + 1}차시)</button>
        </div>); })}
        <button className="btn btn-g btn-s" onClick={function() { setChapters(function(p) { return p.concat([{ title: "", lessons: [{ title: "", pages: "", tasks: [""] }] }]); }); }}>+ 단원 추가</button>
        <div className="br"><button className="btn btn-g" onClick={function() { setShow(false); reset(); }}>취소</button><button className="btn btn-p" onClick={save}>저장</button></div>
      </div></div>)}
    </div>
  );
}

function AdminCurriculum({ users, textbooks, curriculum, setCurriculum }) {
  var insts = users.filter(function(u) { return u.role === "instructor"; });
  var classes = []; users.filter(function(u) { return u.role === "student"; }).forEach(function(s) { if (classes.indexOf(s.classId) === -1) classes.push(s.classId); }); classes.sort();
  var [selInst, setSelInst] = useState(insts.length > 0 ? insts[0].id : "");
  var [selClass, setSelClass] = useState(classes[0] || "");
  var [expTb, setExpTb] = useState(null);
  var [autoOpen, setAutoOpen] = useState(null);
  var [autoStart, setAutoStart] = useState(td());
  var [autoDays, setAutoDays] = useState([]);
  var [holidays, setHolidays] = useState([]);
  var [newHoliday, setNewHoliday] = useState("");
  var [showConfirm, setShowConfirm] = useState(false);

  var getEntry = function(tbId) { return curriculum.find(function(c) { return c.key === selInst + "__" + selClass + "__" + tbId; }); };
  var isLsDone = function(tbId, chId, lsId) { var e = getEntry(tbId); return e ? e.lessons.some(function(l) { return l.lessonId === chId + "__" + lsId; }) : false; };
  var getLsDate = function(tbId, chId, lsId) { var e = getEntry(tbId); var f = e ? e.lessons.find(function(l) { return l.lessonId === chId + "__" + lsId; }) : null; return f ? f.date : ""; };
  var toggleLesson = function(tb, chId, lsId) {
    var key = selInst + "__" + selClass + "__" + tb.id; var lid = chId + "__" + lsId;
    var allLs = tb.chapters.reduce(function(arr, ch) { return arr.concat(ch.lessons.map(function(l) { return ch.id + "__" + l.id; })); }, []);
    var idx = allLs.indexOf(lid);
    setCurriculum(function(prev) {
      var existing = prev.find(function(c) { return c.key === key; }); var current = existing ? existing.lessons : [];
      var isDone = current.some(function(l) { return l.lessonId === lid; }); var next;
      if (isDone) { next = current.filter(function(l) { return allLs.indexOf(l.lessonId) < idx; }); }
      else { var needed = allLs.slice(0, idx + 1); next = needed.map(function(id) { var ex = current.find(function(l) { return l.lessonId === id; }); return ex || { lessonId: id, date: td() }; }); }
      if (existing) return prev.map(function(c) { return c.key === key ? Object.assign({}, c, { lessons: next }) : c; });
      return prev.concat([{ key: key, lessons: next }]);
    });
  };
  var setLsDate = function(tbId, chId, lsId, date) {
    var key = selInst + "__" + selClass + "__" + tbId; var lid = chId + "__" + lsId;
    setCurriculum(function(prev) { return prev.map(function(c) { return c.key === key ? Object.assign({}, c, { lessons: c.lessons.map(function(l) { return l.lessonId === lid ? Object.assign({}, l, { date: date }) : l; }) }) : c; }); });
  };

  var dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
  var toggleDay = function(d) { setAutoDays(function(p) { return p.indexOf(d) >= 0 ? p.filter(function(x) { return x !== d; }) : p.concat([d]).sort(); }); };
  var addHoliday = function() { if (newHoliday && holidays.indexOf(newHoliday) < 0) { setHolidays(function(p) { return p.concat([newHoliday]).sort(); }); setNewHoliday(""); } };

  var autoAssignDates = function(tb) {
    if (autoDays.length === 0) { alert("수업 요일을 선택해주세요!"); return; }
    var key = selInst + "__" + selClass + "__" + tb.id;
    var allLs = tb.chapters.reduce(function(arr, ch) { return arr.concat(ch.lessons.map(function(l) { return ch.id + "__" + l.id; })); }, []);
    // Generate dates
    var dates = [];
    var d = new Date(autoStart);
    var safety = 0;
    while (dates.length < allLs.length && safety < 365) {
      var dow = d.getDay();
      var dateStr = d.toISOString().split("T")[0];
      if (autoDays.indexOf(dow) >= 0 && holidays.indexOf(dateStr) < 0) {
        dates.push(dateStr);
      }
      d.setDate(d.getDate() + 1);
      safety++;
    }
    var newLessons = allLs.map(function(lid, i) { return { lessonId: lid, date: dates[i] || td() }; });
    setCurriculum(function(prev) {
      var existing = prev.find(function(c) { return c.key === key; });
      if (existing) return prev.map(function(c) { return c.key === key ? Object.assign({}, c, { lessons: newLessons }) : c; });
      return prev.concat([{ key: key, lessons: newLessons }]);
    });
    setAutoOpen(null);
  };

  return (
    <div>
      <div className="row2" style={{ marginBottom: 16 }}>
        <div className="fg"><label>강사</label><select value={selInst} onChange={function(e) { setSelInst(e.target.value); }}>{insts.map(function(i) { return <option key={i.id} value={i.id}>{i.avatar} {i.name}</option>; })}</select></div>
        <div className="fg"><label>반</label><select value={selClass} onChange={function(e) { setSelClass(e.target.value); }}>{classes.map(function(c) { return <option key={c} value={c}>{c}</option>; })}</select></div>
      </div>

      {/* Assignment overview for selected class */}
      {(function() {
        var classEntries = curriculum.filter(function(c) { return c.key.indexOf("__" + selClass + "__") >= 0; });
        if (classEntries.length === 0) return null;
        return (
          <div className="card" style={{ marginBottom: 16, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📋 {selClass} 현재 배정 현황</div>
            {classEntries.map(function(entry) {
              var parts = entry.key.split("__");
              var instId = parts[0]; var tbId = parts[2];
              var inst = insts.find(function(i) { return i.id === instId; });
              var tb = textbooks.find(function(t) { return t.id === tbId; });
              return (
                <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 14 }}>{tb ? tb.icon : "📖"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{tb ? tb.name : tbId}</div>
                    <div style={{ fontSize: 10, color: "var(--tx2)" }}>{inst ? inst.name : instId} · {entry.lessons.length}차시 배정</div>
                  </div>
                  <button className="btn btn-g btn-s" style={{ fontSize: 10, color: "#dc2626" }} onClick={function() {
                    if (window.confirm((tb ? tb.name : tbId) + " 배정을 삭제할까요?")) {
                      setCurriculum(function(prev) { return prev.filter(function(c) { return c.key !== entry.key; }); });
                    }
                  }}>✕ 삭제</button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {textbooks.map(function(tb) {
        var op = expTb === tb.id; var e = getEntry(tb.id); var d = e ? e.lessons.length : 0; var t = tb.chapters.reduce(function(s, c) { return s + c.lessons.length; }, 0); var pct = t === 0 ? 0 : Math.round(d / t * 100);
        return (<div key={tb.id} className="tb-card"><div className="tb-head" onClick={function() { setExpTb(op ? null : tb.id); }}><div className="tb-icon" style={{ background: tb.color + "18", color: tb.color }}>{tb.icon}</div><div style={{ flex: 1 }}><div className="tb-name">{tb.name}</div><div className="tb-sub">진도 {d}/{t}차시</div></div><PRing pct={pct} size={36} stroke={3} /><span className={cn("exp", op && "op")}>▼</span></div>
          {op && (<div className="tb-body">
            <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ok btn-s" onClick={function() { setAutoOpen(autoOpen === tb.id ? null : tb.id); }}>📅 날짜 자동 배정</button>
              {e && e.lessons.length > 0 && <button className="btn btn-g btn-s" style={{ color: "#dc2626" }} onClick={function() {
                if (window.confirm(tb.name + "의 진도 배정을 모두 초기화할까요?\n(" + selClass + " 반, " + e.lessons.length + "차시)")) {
                  var key = selInst + "__" + selClass + "__" + tb.id;
                  setCurriculum(function(prev) { return prev.filter(function(c) { return c.key !== key; }); });
                }
              }}>🗑 배정 초기화</button>}
            </div>

            {autoOpen === tb.id && <div style={{ padding: 14, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "var(--r)", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📅 날짜 자동 배정</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <div className="fg" style={{ flex: "1 1 140px" }}>
                  <label style={{ fontSize: 11 }}>시작 날짜</label>
                  <input type="date" value={autoStart} onChange={function(e) { setAutoStart(e.target.value); }} style={{ width: "100%", padding: "6px", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12, fontFamily: "Noto Sans KR" }} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>수업 요일 선택</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {dayLabels.map(function(dl, di) {
                    var isOn = autoDays.indexOf(di) >= 0;
                    return <button key={di} type="button" onClick={function() { toggleDay(di); }} style={{ width: 38, height: 38, borderRadius: "50%", border: isOn ? "2px solid var(--pri)" : "2px solid var(--bdr)", background: isOn ? "var(--prib)" : "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", color: isOn ? "var(--pri)" : di === 0 ? "#dc2626" : di === 6 ? "#2563eb" : "var(--tx)", fontFamily: "Noto Sans KR" }}>{dl}</button>;
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" }}>공휴일 / 휴원일 (건너뛸 날짜)</label>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input type="date" value={newHoliday} onChange={function(e) { setNewHoliday(e.target.value); }} style={{ flex: 1, padding: "5px", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 11, fontFamily: "Noto Sans KR" }} />
                  <button className="btn btn-g btn-s" onClick={addHoliday}>+ 추가</button>
                </div>
                {holidays.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {holidays.map(function(h) { return <span key={h} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "#fef2f2", borderRadius: 10, fontSize: 10, fontWeight: 600, color: "#dc2626" }}>🚫 {h}<button onClick={function() { setHolidays(function(p) { return p.filter(function(x) { return x !== h; }); }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#dc2626", padding: 0 }}>✕</button></span>; })}
                </div>}
              </div>
              <div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 10 }}>총 {t}차시 → {autoDays.map(function(d) { return dayLabels[d]; }).join(",")}요일 수업 → 공휴일 {holidays.length}일 제외</div>
              <button className="btn btn-p" onClick={function() { autoAssignDates(tb); }}>📅 {t}차시 날짜 자동 배정</button>
            </div>}

            {tb.chapters.map(function(ch, ci) { return (<div key={ch.id}><div className="ch-title">{ch.title}</div>
            {ch.lessons.map(function(ls, li) {
              var done = isLsDone(tb.id, ch.id, ls.id); var dt = getLsDate(tb.id, ch.id, ls.id);
              return (<div key={ls.id}><div className="ls-row"><div className={cn("ls-ck", done && "done")} onClick={function() { toggleLesson(tb, ch.id, ls.id); }}>{done && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}</div><div><div className="ls-title"><span style={{ fontSize: 10, fontWeight: 800, color: "var(--pri)", marginRight: 4 }}>{li + 1}차시</span>{ls.title}</div><div className="ls-pages">{ls.pages}</div></div>{done && (<input type="date" value={dt} onChange={function(e) { setLsDate(tb.id, ch.id, ls.id, e.target.value); }} style={{ marginLeft: "auto", padding: "3px 6px", border: "1px solid var(--bdr)", borderRadius: 4, fontSize: 10, fontFamily: "Noto Sans KR" }} />)}</div>{done && <div className="ls-tasks">{ls.tasks.map(function(t, i) { return <span key={i}>📌 {t}</span>; })}</div>}</div>);
            })}</div>); })}</div>)}</div>);
      })}
      <div className="hint">💡 차시를 체크하면 과제가 배정됩니다. 잘못된 배정은 체크 해제하거나 "🗑 배정 초기화"로 삭제하세요.</div>

      {(function() {
        var allEntries = curriculum.filter(function(c) { return c.key.indexOf(selInst + "__" + selClass + "__") === 0; });
        var totalLessons = allEntries.reduce(function(s, e) { return s + e.lessons.length; }, 0);
        if (totalLessons === 0) return null;
        var instName = (insts.find(function(i) { return i.id === selInst; }) || {}).name || selInst;
        return (
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-p" style={{ width: "100%" }} onClick={function() { setShowConfirm(true); }}>✅ 배정 확인하기 ({totalLessons}차시)</button>
          </div>
        );
      })()}

      {showConfirm && (function() {
        var allEntries = curriculum.filter(function(c) { return c.key.indexOf(selInst + "__" + selClass + "__") === 0; });
        var instObj = insts.find(function(i) { return i.id === selInst; });
        var instName = instObj ? instObj.name : selInst;
        var stuCount = users.filter(function(u) { return u.role === "student" && u.classId === selClass; }).length;
        return (
          <div className="mo" onClick={function() { setShowConfirm(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 550, maxHeight: "80vh", overflow: "auto" }}>
            <h3>✅ 진도 배정 확인</h3>
            <div style={{ padding: 12, background: "#f0fdf4", borderRadius: "var(--rs)", marginBottom: 14, border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>📚 {instName} · {selClass}</div>
              <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>학생 {stuCount}명에게 배정됩니다</div>
            </div>
            {allEntries.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: "var(--tx2)" }}>배정된 교재가 없습니다</div> :
              allEntries.map(function(entry) {
                var tbId = entry.key.split("__")[2];
                var tb = textbooks.find(function(t) { return t.id === tbId; });
                var sorted = entry.lessons.slice().sort(function(a, b) { return a.date > b.date ? 1 : -1; });
                var dayNames = ["일", "월", "화", "수", "목", "금", "토"];
                return (
                  <div key={entry.key} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>{tb ? tb.icon : "📖"}</span>
                      <div><div style={{ fontSize: 13, fontWeight: 700 }}>{tb ? tb.name : tbId}</div><div style={{ fontSize: 10, color: "var(--tx2)" }}>{sorted.length}차시 배정</div></div>
                    </div>
                    <div style={{ background: "#f9fafb", borderRadius: "var(--rs)", padding: 8 }}>
                      {sorted.map(function(ls, i) {
                        var parts = ls.lessonId.split("__");
                        var ch = tb ? tb.chapters.find(function(c) { return c.id === parts[0]; }) : null;
                        var lesson = ch ? ch.lessons.find(function(l) { return l.id === parts[1]; }) : null;
                        var dow = ls.date ? dayNames[new Date(ls.date).getDay()] : "";
                        return (
                          <div key={ls.lessonId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", borderBottom: i < sorted.length - 1 ? "1px solid #e5e7eb" : "none", fontSize: 11 }}>
                            <span style={{ fontWeight: 800, color: "var(--pri)", minWidth: 30 }}>{i + 1}차시</span>
                            <span style={{ flex: 1, fontWeight: 600 }}>{lesson ? lesson.title : ls.lessonId}</span>
                            <span style={{ color: "var(--tx2)", fontSize: 10 }}>{ls.date} ({dow})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            }
            <div className="br"><button className="btn btn-g" onClick={function() { setShowConfirm(false); }}>닫기</button></div>
          </div></div>
        );
      })()}
    </div>
  );
}

function pendingReplyThreads(messages) {
  var byStu = {};
  (messages || []).forEach(function(m) { if (!m || !m.studentId) return; (byStu[m.studentId] = byStu[m.studentId] || []).push(m); });
  var now = Date.now();
  var out = [];
  Object.keys(byStu).forEach(function(sid) {
    var th = byStu[sid].sort(function(a, b) { return a.ts - b.ts; });
    var last = th[th.length - 1];
    if (last && last.fromRole === "parent") out.push({ studentId: sid, last: last, waitMin: Math.floor((now - last.ts) / 60000) });
  });
  out.sort(function(a, b) { return a.last.ts - b.last.ts; });
  return out;
}

function MessageThread({ studentId, cur, messages, onSend }) {
  var [text, setText] = useState("");
  var thread = (messages || []).filter(function(m) { return m.studentId === studentId; }).sort(function(a, b) { return a.ts - b.ts; });
  var send = function() { if (!text.trim()) return; onSend(studentId, text); setText(""); };
  return (
    <div>
      <div style={{ maxHeight: 260, overflowY: "auto", padding: 10, background: "#f9fafb", borderRadius: 10, marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {thread.length === 0 ? <div style={{ fontSize: 11, color: "var(--tx2)", textAlign: "center", padding: 16 }}>아직 대화가 없습니다. 첫 메시지를 보내보세요 💬</div>
        : thread.map(function(m) {
          var mine = m.fromId === cur.id;
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              {!mine && <div style={{ fontSize: 9, color: "var(--tx2)", marginBottom: 2, marginLeft: 4 }}>{m.fromName}{m.fromRole === "instructor" ? " 선생님" : " 학부모님"}</div>}
              <div style={{ padding: "8px 12px", borderRadius: 14, fontSize: 12.5, lineHeight: 1.45, background: mine ? "var(--pri)" : "#fff", color: mine ? "#fff" : "var(--tx)", border: mine ? "none" : "1px solid var(--bdr)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
              <div style={{ fontSize: 8, color: "var(--tx2)", marginTop: 2, textAlign: mine ? "right" : "left", padding: "0 4px" }}>{fmtTime(m.ts)}</div>
            </div>
          );
        })}
      </div>
      {onSend ? <div style={{ display: "flex", gap: 6 }}>
        <input value={text} onChange={function(e) { setText(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="메시지를 입력하세요..." style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--bdr)", borderRadius: 10, fontSize: 12.5, fontFamily: "'Noto Sans KR'" }} />
        <button className="btn btn-p btn-s" onClick={send} disabled={!text.trim()} style={{ opacity: text.trim() ? 1 : 0.5 }}>전송</button>
      </div> : <div style={{ fontSize: 10, color: "var(--tx2)", textAlign: "center", padding: "4px 0" }}>읽기 전용 (담당 강사가 답장합니다)</div>}
    </div>
  );
}

function InstructorPage({ user, users, allA, sp, selfCodes, messages, onSend, attendance, scores, classList, forceSave, withdrawals, setWithdrawals, counsels, setCounsels }) {
  var [counselModal, setCounselModal] = useState(null);
  var csNotifSeen = useRef(null);
  var myPendingCounsels = (counsels || []).filter(function(c) { return c.status === "needed" && (c.teacherId === user.id || (!c.teacherId && (user.assignedClasses || []).indexOf(c.classId) >= 0)); });
  useEffect(function() {
    var ids = myPendingCounsels.map(function(c) { return c.id; });
    if (csNotifSeen.current === null) { csNotifSeen.current = ids; return; }
    var fresh = ids.filter(function(id) { return csNotifSeen.current.indexOf(id) < 0; });
    if (fresh.length) { var c = myPendingCounsels.find(function(x) { return x.id === fresh[0]; }); if (c) fireNotif("⚠️ 상담 필요 — " + c.studentName, c.reason); }
    csNotifSeen.current = ids;
  });
  var saveCounsel = function(id, note) {
    setCounsels(function(p) { return (p || []).map(function(c) { return c.id === id ? Object.assign({}, c, { note: note, status: "done", doneDate: td(), doneBy: user.name }) : c; }); });
    setCounselModal(null); if (forceSave) forceSave();
  };
  var [wdStudent, setWdStudent] = useState(null);
  var wdCtx = { allA: allA, sp: sp, scores: scores, attendance: attendance, messages: messages, users: users };
  var isWithdrawn = function(sid) { return (withdrawals || []).some(function(w) { return w.studentId === sid; }); };
  var confirmWithdraw = function(rec) { setWithdrawals(function(p) { return (p || []).concat([rec]); }); setWdStudent(null); if (forceSave) forceSave(); };
  var [selDate, setSelDate] = useState(td()); var [view, setView] = useState("date"); var [expId, setExpId] = useState(null);
  var [cf, setCf] = useState("all");
  var [mainView, setMainView] = useState("homework");
  var [notifTick, setNotifTick] = useState(0);
  var notifGranted = ("Notification" in window) && Notification.permission === "granted";
  var notifUnsupported = !("Notification" in window);
  var [openThread, setOpenThread] = useState(null);
  var [msgRead, setMsgRead] = useState(function() { try { return JSON.parse(localStorage.getItem("rt_msgRead_" + user.id)) || {}; } catch(e) { return {}; } });
  var markRead = function(sid) { var next = Object.assign({}, msgRead); next[sid] = Date.now(); setMsgRead(next); try { localStorage.setItem("rt_msgRead_" + user.id, JSON.stringify(next)); } catch(e) {} };
  var myA = allA.filter(function(a) { return a.instId === user.id; });

  // Get assigned classes from user profile + curriculum
  var assignedClasses = user.assignedClasses || [];
  var currClasses = [];
  myA.forEach(function(a) { if (currClasses.indexOf(a.classId) === -1) currClasses.push(a.classId); });
  var myClasses = assignedClasses.slice();
  currClasses.forEach(function(c) { if (myClasses.indexOf(c) === -1) myClasses.push(c); });
  myClasses.sort();

  var filteredA = cf === "all" ? myA : myA.filter(function(a) { return a.classId === cf; });
  var dateA = filteredA.filter(function(a) { return a.date === selDate; });
  var displayA = view === "date" ? dateA : filteredA;
  var dates = []; myA.forEach(function(a) { if (dates.indexOf(a.date) === -1) dates.push(a.date); }); dates.sort();

  // Class summary with students
  var classSummary = myClasses.map(function(cls) {
    var sts = users.filter(function(u) { return u.role === "student" && u.classId === cls; });
    var clsA = myA.filter(function(a) { return a.classId === cls; });
    var avgPct = 0;
    if (sts.length > 0 && clsA.length > 0) {
      avgPct = Math.round(sts.reduce(function(s, st) {
        return s + clsA.reduce(function(ss, a) { return ss + getPct(sp, st.id, a.id, a.items); }, 0) / clsA.length;
      }, 0) / sts.length);
    }
    return { classId: cls, students: sts, studentCount: sts.length, assignmentCount: clsA.length, avgPct: avgPct };
  });

  // Parent message inbox (one thread per student that has a linked parent)
  var parentByStudent = {};
  users.forEach(function(u) { if (u.role === "parent" && u.childId) parentByStudent[u.childId] = u; });
  var myStudentsAll = users.filter(function(u) { return u.role === "student" && myClasses.indexOf(u.classId) >= 0; });
  var inbox = myStudentsAll.filter(function(s) { return parentByStudent[s.id]; }).map(function(s) {
    var th = (messages || []).filter(function(m) { return m.studentId === s.id; }).sort(function(a, b) { return a.ts - b.ts; });
    var last = th.length ? th[th.length - 1] : null;
    var unread = th.some(function(m) { return m.fromRole === "parent" && m.ts > (msgRead[s.id] || 0); });
    return { student: s, parent: parentByStudent[s.id], last: last, count: th.length, unread: unread };
  });
  inbox.sort(function(a, b) {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    var at = a.last ? a.last.ts : 0; var bt = b.last ? b.last.ts : 0;
    return bt - at;
  });
  var unreadTotal = inbox.filter(function(x) { return x.unread; }).length;
  var openStudent = openThread ? myStudentsAll.find(function(s) { return s.id === openThread; }) : null;

  // 출석/성적 통계 헬퍼 (담임 대시보드)
  var att = attendance || {};
  var scs = scores || {};
  var dayKeys14 = []; for (var _i = 0; _i < 14; _i++) { var _d = new Date(); _d.setDate(_d.getDate() - _i); dayKeys14.push(_d.toISOString().split("T")[0]); }
  var attDays = function(sid) { var n = 0; dayKeys14.forEach(function(k) { var a = att[k] || {}; if (a[sid]) n++; }); return n; };
  var todayAttOf = function(sid) { var a = att[td()] || {}; return a[sid] || ""; };
  var latestGrade = function(sid) {
    var sc = scs[sid]; if (!sc || !sc.exams || !sc.exams.length) return null;
    var exs = sc.exams.slice().sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var subs = exs[0].subjects || {}; var gs = [];
    Object.keys(subs).forEach(function(k) { var g = Number((subs[k] || {}).grade); if (g >= 1 && g <= 9) gs.push(g); });
    return gs.length ? (gs.reduce(function(a, b) { return a + b; }, 0) / gs.length) : null;
  };
  var classStats = classSummary.map(function(cs) {
    var presentToday = cs.students.filter(function(s) { return todayAttOf(s.id); }).length;
    var rate2w = cs.students.length ? Math.round(cs.students.reduce(function(t, s) { return t + attDays(s.id); }, 0) / cs.students.length / 14 * 100) : 0;
    var grds = cs.students.map(function(s) { return latestGrade(s.id); }).filter(function(g) { return g !== null; });
    var avgGrade = grds.length ? (grds.reduce(function(a, b) { return a + b; }, 0) / grds.length) : null;
    return { classId: cs.classId, students: cs.students, studentCount: cs.studentCount, avgPct: cs.avgPct, presentToday: presentToday, rate2w: rate2w, avgGrade: avgGrade, gradedCount: grds.length };
  });

  return (
    <div>
      <div className="ph"><h2>📋 {user.name} 담임 대시보드</h2><p>담당 반: {myClasses.length > 0 ? myClasses.join(", ") : "배정된 반이 없습니다 (관리자에게 요청하세요)"}</p></div>

      {(selfCodes && selfCodes[td()]) && <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", marginBottom: 14, background: "linear-gradient(135deg, #ede9fe, #f5f3ff)", border: "2px solid #c4b5fd", borderRadius: "var(--r)" }}>
        <span style={{ fontSize: 20 }}>📱</span>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9" }}>오늘의 자가출석 코드</div><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 5, color: "#5b21b6", fontFamily: "'Noto Sans KR'" }}>{selfCodes[td()]}</div></div>
        <div style={{ fontSize: 9, color: "var(--tx2)", marginLeft: "auto", maxWidth: 120, textAlign: "right" }}>학생 자가출석용. 학원에서만 보여주세요.</div>
      </div>}

      <div key={notifTick} style={{ padding: 10, borderRadius: 10, marginBottom: 14, fontSize: 11, background: notifGranted ? "#eff6ff" : "#fef3c7", border: "1px solid " + (notifGranted ? "#bfdbfe" : "#fde68a") }}>
        {notifUnsupported ? <span>🔕 이 브라우저는 알림을 지원하지 않습니다 (PC Chrome 권장)</span>
        : notifGranted ? <span>🔔 자가출석 알림 활성화됨 — 담당 반 학생이 자가출석하면 이 기기로 알림이 옵니다 (앱이 켜져 있을 때)</span>
        : <span>🔕 자가출석 알림 꺼짐 — <button onClick={function() { if ("Notification" in window) { Notification.requestPermission().then(function() { setNotifTick(function(t) { return t + 1; }); }); } }} style={{ background: "none", border: "none", color: "#2563eb", textDecoration: "underline", cursor: "pointer", fontSize: 11, fontFamily: "'Noto Sans KR'" }}>알림 허용하기</button></span>}
      </div>

      <div className="tabs notranslate" translate="no" style={{ marginBottom: 14 }}>
        {[["homework", "📊 과제"], ["attendance", "📋 출석"], ["stats", "📈 통계"], ["consult", "💬 상담" + (unreadTotal > 0 ? " ●" : "")]].map(function(it) {
          return <button key={it[0]} className={cn("tab", mainView === it[0] && "on")} onClick={function() { setMainView(it[0]); }} style={{ fontSize: 14 }}>{it[1]}</button>;
        })}
      </div>

      {wdStudent && <WithdrawalModal student={wdStudent} ctx={wdCtx} cur={user} onClose={function() { setWdStudent(null); }} onConfirm={confirmWithdraw} />}
      {counselModal && <CounselModal counsel={counselModal} onClose={function() { setCounselModal(null); }} onSave={function(note) { saveCounsel(counselModal.id, note); }} />}

      {myPendingCounsels.length > 0 && <div className="card" style={{ marginBottom: 14, border: "1px solid #fecaca", background: "#fef2f2" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#b91c1c", marginBottom: 8 }}>⚠️ 상담 필요 ({myPendingCounsels.length})</div>
        {myPendingCounsels.map(function(c) {
          return <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #fde0e0" }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{c.studentName} <span style={{ fontSize: 10, color: "var(--tx2)" }}>{c.classId} · {c.date}</span></div><div style={{ fontSize: 11.5, color: "#7f1d1d" }}>{c.reason}</div></div>
            <button className="btn btn-p btn-s" onClick={function() { setCounselModal(c); }}>상담 기록</button>
          </div>;
        })}
      </div>}

      {mainView === "consult" && (inbox.length > 0 ? <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>💬 학부모 상담 메시지</h3>
          {unreadTotal > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", background: "var(--pri)", borderRadius: 10, padding: "2px 8px" }}>안읽음 {unreadTotal}</span>}
        </div>
        {inbox.map(function(it) {
          return (
            <div key={it.student.id} onClick={function() { setOpenThread(it.student.id); markRead(it.student.id); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 6px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}>
              <span style={{ fontSize: 22 }}>{it.student.avatar}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{it.student.name} <span style={{ fontSize: 12.5, color: "var(--tx2)", fontWeight: 400 }}>· {it.parent.name} 학부모님</span></div>
                <div style={{ fontSize: 13.5, color: "var(--tx2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.last ? (it.last.fromRole === "instructor" ? "나: " : "") + it.last.text : "대화를 시작해보세요"}</div>
              </div>
              {it.last && <div style={{ fontSize: 11.5, color: "var(--tx2)", flexShrink: 0 }}>{fmtTime(it.last.ts)}</div>}
              {it.unread && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--pri)", flexShrink: 0 }} />}
            </div>
          );
        })}
      </div> : <div className="empty"><div className="eic">💬</div><p>연결된 학부모가 없습니다. 학부모 계정이 자녀와 연결되면 여기에 표시됩니다.</p></div>)}

      {openStudent && <div className="mo" onClick={function() { setOpenThread(null); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>💬 {openStudent.name} <span style={{ fontSize: 11, color: "var(--tx2)", fontWeight: 400 }}>({openStudent.classId} · {(parentByStudent[openStudent.id] || {}).name} 학부모님)</span></h3>
          <button onClick={function() { setOpenThread(null); }} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--tx2)" }}>✕</button>
        </div>
        <MessageThread studentId={openStudent.id} cur={user} messages={messages} onSend={onSend} />
      </div></div>}

      {mainView === "attendance" && (myClasses.length === 0 ? <div className="empty"><div className="eic">📋</div><p>담당 반이 없습니다</p></div> : classStats.map(function(cs) {
        return (
          <div key={cs.classId} className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>🏫 {cs.classId} <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 400 }}>· 오늘 {cs.presentToday}/{cs.studentCount} 출석</span></div>
            {cs.students.length === 0 ? <div style={{ fontSize: 13, color: "var(--tx2)", padding: 6 }}>학생이 없습니다</div> : cs.students.map(function(s) {
              var ct = todayAttOf(s.id); var self = ct.indexOf("(자가)") >= 0; var pure = ct.replace("(자가)", "");
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 4px", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 18 }}>{s.avatar}</span>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{s.name}{isWithdrawn(s.id) && <span style={{ fontSize: 9, fontWeight: 800, color: "#dc2626", background: "#fef2f2", borderRadius: 8, padding: "1px 6px", marginLeft: 6 }}>퇴원</span>}</div>
                  <div style={{ width: 84, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{ct ? <span style={{ color: "var(--ok)" }}>{pure}{self && <span style={{ fontSize: 11.5, color: "#7c3aed" }}> 📱자가</span>}</span> : <span style={{ color: "#dc2626" }}>결석</span>}</div>
                  <div style={{ width: 56, textAlign: "right", fontSize: 12, color: "var(--tx2)" }}>2주 {attDays(s.id)}일</div>
                  {!isWithdrawn(s.id) && <button className="btn btn-g btn-s" style={{ fontSize: 11, padding: "3px 8px", color: "#dc2626", borderColor: "#fecaca" }} onClick={function() { setWdStudent(s); }}>퇴원</button>}
                </div>
              );
            })}
          </div>
        );
      }))}

      {mainView === "stats" && (classStats.length === 0 ? <div className="empty"><div className="eic">📈</div><p>담당 반이 없습니다</p></div> : classStats.map(function(cs) {
        return (
          <div key={cs.classId} className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>🏫 {cs.classId} 통계</div>
            <div className="sg">
              <div className="sc"><div className="sl" style={{ fontSize: 13 }}>학생</div><div className="sv b">{cs.studentCount}명</div></div>
              <div className="sc"><div className="sl" style={{ fontSize: 13 }}>오늘 출석</div><div className="sv g">{cs.presentToday}/{cs.studentCount}</div></div>
              <div className="sc"><div className="sl" style={{ fontSize: 13 }}>2주 출석률</div><div className="sv b">{cs.rate2w}%</div></div>
              <div className="sc"><div className="sl" style={{ fontSize: 13 }}>과제 완료율</div><div className="sv a">{cs.avgPct}%</div></div>
              <div className="sc"><div className="sl" style={{ fontSize: 13 }}>평균 등급</div><div className="sv g">{cs.avgGrade !== null ? cs.avgGrade.toFixed(1) : "—"}</div></div>
            </div>
            {cs.avgGrade !== null && <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 4 }}>· 최근 시험 평균 · 성적 입력 {cs.gradedCount}/{cs.studentCount}명</div>}
          </div>
        );
      }))}

      {mainView === "homework" && <>
      <div style={{ fontSize: 12, color: "var(--tx2)", background: "#f9fafb", border: "1px solid var(--bdr)", borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>👁 <strong>보기 전용</strong> — 담임은 학생들의 과제 진행 상태만 확인합니다. 과제 편집·체크는 관리자 권한입니다.</div>
      {myClasses.length > 0 && <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {classSummary.map(function(cs) {
          return (
            <div key={cs.classId} style={{ flex: "1 1 140px", padding: "10px 12px", background: "var(--card)", border: cf === cs.classId ? "2px solid var(--pri)" : "1px solid var(--bdr)", borderRadius: "var(--r)", cursor: "pointer" }} onClick={function() { setCf(cf === cs.classId ? "all" : cs.classId); }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🏫 {cs.classId}</div>
              <div style={{ fontSize: 12.5, color: "var(--tx2)" }}>학생 {cs.studentCount}명 · 과제 {cs.assignmentCount}건</div>
              {cs.assignmentCount > 0 && <div style={{ marginTop: 6 }}><PBar pct={cs.avgPct} /></div>}
            </div>
          );
        })}
      </div>}

      {view === "students" && cf !== "all" && (function() {
        var cs = classSummary.find(function(c) { return c.classId === cf; });
        if (!cs) return null;
        return (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏫 {cf} 학생 목록 ({cs.studentCount}명)</div>
            {cs.students.map(function(s) {
              return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}><span>{s.avatar}</span><span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span></div>;
            })}
          </div>
        );
      })()}

      <div className="fb" style={{ flexWrap: "wrap" }}>
        <button className={cn("fc", view === "date" && "on")} onClick={function() { setView("date"); }}>📅 날짜별</button>
        <button className={cn("fc", view === "all" && "on")} onClick={function() { setView("all"); }}>📋 전체</button>
        {cf !== "all" && <button className={cn("fc", view === "students" && "on")} onClick={function() { setView("students"); }}>👨‍🎓 학생 목록</button>}
        {myClasses.length > 1 && <span style={{ fontSize: 11, color: "var(--tx2)", margin: "0 4px" }}>|</span>}
        {myClasses.length > 1 && <button className={cn("fc", cf === "all" && "on")} onClick={function() { setCf("all"); }}>전체 반</button>}
        {myClasses.map(function(c) { return <button key={c} className={cn("fc", cf === c && "on")} onClick={function() { setCf(c); }}>{c}</button>; })}
      </div>
      {view === "date" && (<div className="date-nav"><button onClick={function() { var i = dates.indexOf(selDate); if (i > 0) setSelDate(dates[i - 1]); }}>◀</button><input type="date" value={selDate} onChange={function(e) { setSelDate(e.target.value); }} /><button onClick={function() { var i = dates.indexOf(selDate); if (i < dates.length - 1) setSelDate(dates[i + 1]); }}>▶</button><button className="today-btn" onClick={function() { setSelDate(td()); }}>오늘</button><span style={{ fontSize: 11, color: "var(--tx2)" }}>배정 {dateA.length}건</span></div>)}
      {(view === "date" || view === "all") && (displayA.length === 0 ? (<div className="empty"><div className="eic">📭</div><p>{view === "date" ? "이 날짜에 배정된 과제가 없습니다" : "배정된 과제가 없습니다"}</p></div>)
        : displayA.map(function(a) {
          var open = expId === a.id;
          var sts = users.filter(function(u) { return u.role === "student" && u.classId === a.classId; });
          var avg = sts.length === 0 ? 0 : Math.round(sts.reduce(function(s, st) { return s + getPct(sp, st.id, a.id, a.items); }, 0) / sts.length);
          return (<div key={a.id} className="ac"><div className="ahead" onClick={function() { setExpId(open ? null : a.id); }}><div style={{ width: 6, height: 36, borderRadius: 3, background: a.color, flexShrink: 0 }} /><div style={{ flex: 1 }}><div className="at" style={{ fontSize: 16 }}>{a.title}</div><div className="am" style={{ fontSize: 12 }}><span>🏫 {a.classId}</span><span>📄 {a.desc}</span><span className="abadge">⚡ 진도연동</span>{view === "all" && <span className="dbadge" style={{ background: "#f3f4f6", color: "var(--tx2)" }}>📅 {a.date}</span>}</div></div><PRing pct={avg} /><span className={cn("exp", open && "op")} style={{ marginLeft: 6 }}>▼</span></div>
            {open && (<div className="abody"><div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 6 }}>📖 {a.chTitle}</div><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>체크 항목:</div>{a.items.map(function(t) { return <div key={t.id} style={{ fontSize: 13, padding: "2px 0 2px 8px", color: "var(--tx2)" }}>• {t.label}</div>; })}<div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>학생별 진행률:</div>
              {sts.map(function(s) { var p = getPct(sp, s.id, a.id, a.items); return (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 13, width: 68, fontWeight: 500 }}>{s.avatar} {s.name}</span><div style={{ flex: 1 }}><PBar pct={p} /></div><span style={{ fontSize: 12, fontWeight: 700, width: 36, textAlign: "right" }}>{p}%</span>{p === 0 && <span className="dbadge" style={{ background: "#fef2f2", color: "#dc2626" }}>⚠️</span>}</div>); })}</div>)}</div>);
        }))}
      </>}
    </div>
  );
}

function StudentPage({ user, allA, sp, setSp, ohdap, setOhdap, attendance, setAttendance, forceSave, selfCodes }) {
  var [expId, setExpId] = useState(null); var [filter, setFilter] = useState("all");
  var [view, setView] = useState("tasks");
  var myA = allA.filter(function(a) { return a.classId === user.classId; });
  var toggle = function(aid, tid) { setSp(function(p) { var cur = (p[user.id] && p[user.id][aid]) ? p[user.id][aid] : []; var next = cur.indexOf(tid) >= 0 ? cur.filter(function(t) { return t !== tid; }) : cur.concat([tid]); var newSp = Object.assign({}, p); newSp[user.id] = Object.assign({}, p[user.id]); newSp[user.id][aid] = next; return newSp; }); };
  var totalT = myA.reduce(function(s, a) { return s + a.items.length; }, 0);
  var doneT = myA.reduce(function(s, a) { return s + ((sp[user.id] && sp[user.id][a.id]) ? sp[user.id][a.id].length : 0); }, 0);
  var pct = totalT === 0 ? 0 : Math.round(doneT / totalT * 100);
  var fA = filter === "all" ? myA : filter === "done" ? myA.filter(function(a) { return getPct(sp, user.id, a.id, a.items) === 100; }) : myA.filter(function(a) { return getPct(sp, user.id, a.id, a.items) < 100; });
  var incompleteCount = myA.filter(function(a) { return getPct(sp, user.id, a.id, a.items) < 100; }).length;
  if (view === "ohdap") {
    return <StudentOhdap user={user} ohdap={ohdap} setOhdap={setOhdap} onBack={function() { setView("tasks"); }} />;
  }

  if (view === "attendance") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="ph" style={{ marginBottom: 0 }}><h2>📋 출석 체크</h2></div>
          <button className="btn btn-g" onClick={function() { setView("tasks"); }}>← 과제 목록</button>
        </div>
        <StudentAttendance user={user} attendance={attendance} setAttendance={setAttendance} forceSave={forceSave} selfCodes={selfCodes} />
      </div>
    );
  }

  var todayAttend = (attendance[td()] && attendance[td()][user.id]) ? true : false;

  return (
    <div>
      <div className="ph"><h2>📋 전체</h2><p>{user.classId} · 진도에 따라 배정된 과제</p></div>

      {todayAttend ? <div style={{ padding: "10px 16px", borderRadius: "var(--r)", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, background: "var(--okb)", border: "1px solid #a7f3d0", color: "#065f46", cursor: "pointer" }} onClick={function() { setView("attendance"); }}><span style={{ fontSize: 16 }}>✅</span><span>오늘 출석 완료 ({attendance[td()][user.id].replace("(자가)", "")}){attendance[td()][user.id].indexOf("(자가)") >= 0 && " 📱자가"}</span></div>
      : <div style={{ padding: "12px 16px", borderRadius: "var(--r)", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, background: "#fef2f4", border: "1px solid #fecdd3", color: "#be123c", cursor: "pointer" }} onClick={function() { setView("attendance"); }}><span style={{ fontSize: 20 }}>📋</span><span>출석 체크하기 →</span></div>}

      {Number(ohdap.active) > 0 && <div style={{ padding: "12px 16px", borderRadius: "var(--r)", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, background: "#fef2f4", border: "1px solid #fecdd3", color: "#be123c", cursor: "pointer" }} onClick={function() { setView("ohdap"); }}><span style={{ fontSize: 20 }}>🔥</span><span>오답데이 진행 중! 터치하여 확인하기 →</span></div>}
      {Number(ohdap.active) === 0 && <div style={{ padding: "10px 16px", borderRadius: "var(--r)", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 500, background: "#f3f4f6", border: "1px solid var(--bdr)", color: "var(--tx2)", cursor: "pointer" }} onClick={function() { setView("ohdap"); }}><span style={{ fontSize: 16 }}>📝</span><span>오답데이 확인하기 →</span></div>}
      {incompleteCount > 0 && <div className="notif-banner warn" style={{ padding: "12px 16px", borderRadius: "var(--r)", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c" }}><span style={{ fontSize: 20 }}>📢</span><span>{"미완료 과제 " + incompleteCount + "개! 화이팅! 💪"}</span></div>}
      {pct === 100 && totalT > 0 && <div style={{ padding: "12px 16px", borderRadius: "var(--r)", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8" }}><span style={{ fontSize: 20 }}>🎉</span><span>모든 과제를 완료했어요! 대단해요!</span></div>}
      <div className="sg"><div className="sc"><div className="sl">전체 과제</div><div className="sv b">{myA.length}</div></div><div className="sc"><div className="sl">진행률</div><div className="sv g">{pct}%</div></div><div className="sc"><div className="sl">남은 항목</div><div className="sv a">{totalT - doneT}</div></div><div className="sc"><div className="sl">완료</div><div className="sv r">{myA.filter(function(a) { return getPct(sp, user.id, a.id, a.items) === 100; }).length}</div></div></div>
      <div className="fb"><button className={cn("fc", filter === "all" && "on")} onClick={function() { setFilter("all"); }}>전체</button><button className={cn("fc", filter === "doing" && "on")} onClick={function() { setFilter("doing"); }}>🔔 미완료</button><button className={cn("fc", filter === "done" && "on")} onClick={function() { setFilter("done"); }}>완료</button></div>
      {fA.length === 0 ? <div className="empty"><div className="eic">📭</div><p>해당하는 과제가 없습니다</p></div> :
        fA.map(function(a) {
          var p = getPct(sp, user.id, a.id, a.items); var open = expId === a.id;
          var done = (sp[user.id] && sp[user.id][a.id]) ? sp[user.id][a.id] : [];
          return (<div key={a.id} className="ac" style={p === 0 ? { borderColor: "#fca5a5" } : {}}>
            <div className="ahead" onClick={function() { setExpId(open ? null : a.id); }}><div style={{ width: 5, height: 32, borderRadius: 3, background: a.color, flexShrink: 0 }} /><div style={{ flex: 1 }}><div className="at">{a.title}{p === 0 && <span className="dbadge" style={{ background: "#fef2f2", color: "#dc2626", marginLeft: 6 }}>🔔 시작하세요!</span>}</div><div className="am"><span style={{ color: a.color, fontWeight: 600 }}>{a.tbIcon} {a.tbName}</span><span>📄 {a.desc}</span><span className="dbadge" style={{ background: "#f3f4f6", color: "var(--tx2)" }}>📅 {a.date}</span></div></div><PRing pct={p} /><span className={cn("exp", open && "op")} style={{ marginLeft: 6 }}>▼</span></div>
            {open && (<div className="abody"><div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 8 }}>📖 {a.chTitle}</div>
              {a.items.map(function(task) { var ck = done.indexOf(task.id) >= 0; return (<div key={task.id} className="ti"><div className={cn("tc", ck && "ck")} onClick={function() { toggle(a.id, task.id); }}>{ck && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}</div><span className={cn("tl", ck && "dn")}>{task.label}</span></div>); })}</div>)}
          </div>);
        })}
    </div>
  );
}

function getMonthKey(offset) {
  var d = new Date();
  if (offset) d.setMonth(d.getMonth() + offset);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function getMonthLabel(key) {
  var parts = key.split("-");
  return parseInt(parts[1]) + "월";
}

function AdminOhdap({ users, ohdap, setOhdap, forceSave }) {
  var save = function() { if (forceSave) forceSave(); };
  var [cf, setCf] = useState("all");
  var curMonth = getMonthKey(0);
  var [viewMonth, setViewMonth] = useState(curMonth);
  var students = users.filter(function(u) { return u.role === "student"; });
  var classes = []; students.forEach(function(s) { if (classes.indexOf(s.classId) === -1) classes.push(s.classId); }); classes.sort();
  var filtered = cf === "all" ? students : students.filter(function(s) { return s.classId === cf; });
  var week = Math.ceil(new Date().getDate() / 7);
  var months = ohdap.months || {};
  var viewData = months[viewMonth] || { round1: {}, round2: {} };
  var r1 = viewData.round1 || {};
  var r2 = viewData.round2 || {};

  // Collect all months that have data
  var allMonths = Object.keys(months).sort();
  if (allMonths.indexOf(curMonth) < 0) allMonths.push(curMonth);
  // Add prev/next month if not present
  var prevMonth = getMonthKey(-1);
  var nextMonth = getMonthKey(1);
  if (allMonths.indexOf(prevMonth) < 0) allMonths.push(prevMonth);
  allMonths.sort();

  var resetMonth = function() {
    if (window.confirm(getMonthLabel(viewMonth) + " 기록을 초기화할까요?")) {
      setOhdap(function(prev) {
        var next = JSON.parse(JSON.stringify(prev));
        if (!next.months) next.months = {};
        next.months[viewMonth] = { round1: {}, round2: {} };
        return next;
      });
      save();
    }
  };
  var checkStudent = function(sid, round) {
    setOhdap(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next.months) next.months = {};
      if (!next.months[viewMonth]) next.months[viewMonth] = { round1: {}, round2: {} };
      var key = "round" + round;
      if (!next.months[viewMonth][key]) next.months[viewMonth][key] = {};
      next.months[viewMonth][key][sid] = !next.months[viewMonth][key][sid];
      return next;
    });
    save();
  };

  var setAllRound = function(round, val) {
    setOhdap(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next.months) next.months = {};
      if (!next.months[viewMonth]) next.months[viewMonth] = { round1: {}, round2: {} };
      var key = "round" + round;
      if (!next.months[viewMonth][key]) next.months[viewMonth][key] = {};
      filtered.forEach(function(s) { if (val) next.months[viewMonth][key][s.id] = true; else delete next.months[viewMonth][key][s.id]; });
      return next;
    });
    save();
  };
  var allDone = function(round) { var m = round === 1 ? r1 : r2; return filtered.length > 0 && filtered.every(function(s) { return m[s.id]; }); };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>📝 오답데이 (월별 관리)</h3>
        <p style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>{week}째주{(week === 2 || week === 4) ? " · " : ""}{(week === 2 || week === 4) && <span style={{ color: "var(--pri)", fontWeight: 700 }}>오답데이 주간!</span>}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>📅 월 선택:</span>
        {allMonths.map(function(m) {
          var isCur = m === curMonth;
          return <button key={m} className={cn("fc", viewMonth === m && "on")} onClick={function() { setViewMonth(m); }}>{getMonthLabel(m)}{isCur ? " (이번달)" : ""}</button>;
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, justifyContent: "flex-end" }}>
        <button className="btn btn-g btn-s" onClick={resetMonth}>🔄 {getMonthLabel(viewMonth)} 초기화</button>
      </div>

      <div className="fb">
        <button className={cn("fc", cf === "all" && "on")} onClick={function() { setCf("all"); }}>전체</button>
        {classes.map(function(c) { return <button key={c} className={cn("fc", cf === c && "on")} onClick={function() { setCf(c); }}>{c}</button>; })}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "4px 0 10px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--tx2)" }}>{cf === "all" ? "전체" : cf} 일괄:</span>
        <button className="btn btn-ok btn-s" onClick={function() { setAllRound(1, !allDone(1)); }}>1회차 {allDone(1) ? "전원 해제" : "전원 체크"}</button>
        <button className="btn btn-ok btn-s" onClick={function() { setAllRound(2, !allDone(2)); }}>2회차 {allDone(2) ? "전원 해제" : "전원 체크"}</button>
      </div>

      <div className="card">
        <div style={{ display: "flex", padding: "8px 4px", borderBottom: "2px solid var(--bdr)", fontSize: 10, fontWeight: 700, color: "var(--tx2)" }}>
          <div style={{ flex: 1 }}>학생</div>
          <div style={{ width: 70, textAlign: "center" }}>1회차</div>
          <div style={{ width: 70, textAlign: "center" }}>2회차</div>
        </div>
        {filtered.map(function(s) {
          var d1 = r1[s.id] ? true : false;
          var d2 = r2[s.id] ? true : false;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "10px 4px", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 16, marginRight: 8 }}>{s.avatar}</span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div><div style={{ fontSize: 10, color: "var(--tx2)" }}>{s.classId}</div></div>
              <div style={{ width: 70, textAlign: "center" }}>
                <div onClick={function() { checkStudent(s.id, 1); }} style={{ width: 30, height: 30, borderRadius: 8, border: d1 ? "2px solid var(--ok)" : "2px solid #d1d5db", background: d1 ? "var(--ok)" : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{d1 && <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>✓</span>}</div>
              </div>
              <div style={{ width: 70, textAlign: "center" }}>
                <div onClick={function() { checkStudent(s.id, 2); }} style={{ width: 30, height: 30, borderRadius: 8, border: d2 ? "2px solid var(--ok)" : "2px solid #d1d5db", background: d2 ? "var(--ok)" : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{d2 && <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>✓</span>}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hint" style={{ marginTop: 14 }}>💡 월별로 1회차/2회차 오답데이를 관리합니다. 이전 달 기록도 확인할 수 있어요.</div>
    </div>
  );
}

function StudentOhdap({ user, ohdap, setOhdap, onBack }) {
  var activeRound = Number(ohdap.active) || 0;
  var activeMonth = ohdap.activeMonth || "";
  var months = ohdap.months || {};
  var curMonth = getMonthKey(0);

  // Show current month + any months with data
  var showMonths = Object.keys(months).sort();
  if (showMonths.indexOf(curMonth) < 0) showMonths.push(curMonth);
  showMonths.sort().reverse(); // newest first

  var toggleRound = function(month, round) {
    setOhdap(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next.months) next.months = {};
      if (!next.months[month]) next.months[month] = { round1: {}, round2: {} };
      var key = "round" + round;
      if (!next.months[month][key]) next.months[month][key] = {};
      next.months[month][key][user.id] = !next.months[month][key][user.id];
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="ph" style={{ marginBottom: 0 }}><h2>📝 오답데이</h2></div>
        {onBack && <button className="btn btn-g" onClick={onBack}>← 과제 목록</button>}
      </div>

      {activeRound > 0 && <div style={{ padding: "12px 16px", borderRadius: "var(--r)", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 600, background: "#fef2f4", border: "1px solid #fecdd3", color: "#be123c" }}><span style={{ fontSize: 20 }}>🔥</span><span>{getMonthLabel(activeMonth)} {activeRound}회차 진행 중!</span></div>}

      {showMonths.map(function(m) {
        var mData = months[m] || { round1: {}, round2: {} };
        var r1Done = (mData.round1 && mData.round1[user.id]) ? true : false;
        var r2Done = (mData.round2 && mData.round2[user.id]) ? true : false;
        var isCur = m === curMonth;
        var isActiveMonth = activeMonth === m && activeRound > 0;

        return (
          <div key={m} style={{ marginBottom: 16, padding: 16, background: "var(--card)", border: isActiveMonth ? "2px solid var(--pri)" : "1px solid var(--bdr)", borderRadius: "var(--r)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              📅 {getMonthLabel(m)}{isCur ? " (이번달)" : ""}
              {isActiveMonth && <span className="dbadge" style={{ background: "#fef2f4", color: "var(--pri)" }}>🔥 진행 중</span>}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, padding: 16, background: r1Done ? "var(--okb)" : "#f9fafb", border: r1Done ? "2px solid var(--ok)" : "1px solid var(--bdr)", borderRadius: "var(--r)", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>1회차</div>
                <div style={{ fontSize: 30, marginBottom: 8 }}>{r1Done ? "✅" : "📝"}</div>
                <button onClick={function() { toggleRound(m, 1); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Noto Sans KR", background: r1Done ? "#e5e7eb" : "linear-gradient(135deg, var(--ok), #34d399)", color: r1Done ? "var(--tx2)" : "#fff" }}>
                  {r1Done ? "↩ 취소" : "✅ 다 풀었어요!"}
                </button>
              </div>
              <div style={{ flex: 1, padding: 16, background: r2Done ? "var(--okb)" : "#f9fafb", border: r2Done ? "2px solid var(--ok)" : "1px solid var(--bdr)", borderRadius: "var(--r)", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>2회차</div>
                <div style={{ fontSize: 30, marginBottom: 8 }}>{r2Done ? "✅" : "📝"}</div>
                <button onClick={function() { toggleRound(m, 2); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Noto Sans KR", background: r2Done ? "#e5e7eb" : "linear-gradient(135deg, var(--ok), #34d399)", color: r2Done ? "var(--tx2)" : "#fff" }}>
                  {r2Done ? "↩ 취소" : "✅ 다 풀었어요!"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminParents({ users, setUsers, forceSave }) {
  var [show, setShow] = useState(false);
  var [nm, setNm] = useState(""); var [pw, setPw] = useState("1234"); var [childId, setChildId] = useState("");
  var parents = users.filter(function(u) { return u.role === "parent"; });
  var students = users.filter(function(u) { return u.role === "student"; });

  var add = function() {
    if (!nm.trim() || !childId) return;
    setUsers(function(p) { return p.concat([{ id: "par_" + mkid(), name: nm.trim(), role: "parent", password: pw || "1234", avatar: "👨‍👩‍👧", childId: childId }]); });
    setNm(""); setPw("1234"); setChildId(""); setShow(false); forceSave();
  };
  var del = function(uid) { if (window.confirm("삭제할까요?")) { setUsers(function(p) { return p.filter(function(u) { return u.id !== uid; }); }); forceSave(); } };
  var getChild = function(cid) { return students.find(function(s) { return s.id === cid; }); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>👨‍👩‍👧 학부모 계정 ({parents.length}명)</h3>
        <button className="btn btn-p btn-s" onClick={function() { setShow(true); }}>+ 학부모 추가</button>
      </div>
      {parents.length === 0 ? <div className="empty"><p>등록된 학부모가 없습니다</p></div> :
        <div>{parents.map(function(p) {
          var ch = getChild(p.childId);
          return (
            <div key={p.id} className="card" style={{ marginBottom: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{p.avatar}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--tx2)" }}>비밀번호: {p.password}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>자녀: <span style={{ fontWeight: 700, color: "var(--pri)" }}>{ch ? ch.avatar + " " + ch.name + " (" + ch.classId + ")" : "미연결"}</span></div>
                </div>
                <button className="btn-d" onClick={function() { del(p.id); }}>✕</button>
              </div>
            </div>
          );
        })}</div>}
      {show && <div className="mo" onClick={function() { setShow(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 450 }}>
        <h3>학부모 추가</h3>
        <div className="fg"><label>학부모 이름</label><input value={nm} onChange={function(e) { setNm(e.target.value); }} placeholder="학부모 이름" /></div>
        <div className="fg"><label>비밀번호</label><input value={pw} onChange={function(e) { setPw(e.target.value); }} /></div>
        <div className="fg"><label>자녀 선택</label>
          <select value={childId} onChange={function(e) { setChildId(e.target.value); }} style={{ width: "100%", padding: "8px", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12, fontFamily: "Noto Sans KR" }}>
            <option value="">-- 자녀를 선택하세요 --</option>
            {students.map(function(s) { return <option key={s.id} value={s.id}>{s.name} ({s.classId})</option>; })}
          </select>
        </div>
        <div className="br"><button className="btn btn-g" onClick={function() { setShow(false); }}>취소</button><button className="btn btn-p" onClick={add}>추가</button></div>
      </div></div>}
      <div className="hint" style={{ marginTop: 12 }}>💡 학부모 계정을 만들면, 학부모가 자녀의 과제 진행률과 출석 기록을 확인할 수 있습니다.</div>
    </div>
  );
}

function ParentDashboard({ user, users, allA, sp, attendance, messages, onSend }) {
  var students = users.filter(function(u) { return u.role === "student"; });
  var child = students.find(function(s) { return s.id === user.childId; });
  var today = td();
  var todayData = attendance[today] || {};

  if (!child) return (<div><div className="ph"><h2>👨‍👩‍👧 학부모</h2><p>연결된 자녀가 없습니다. 관리자에게 문의하세요.</p></div></div>);

  var homeroom = users.filter(function(u) { return u.role === "instructor" && (u.assignedClasses || []).indexOf(child.classId) >= 0; });
  var homeroomLabel = homeroom.length ? homeroom.map(function(t) { return t.name; }).join(", ") + " 선생님" : "담임 선생님";

  // Attendance
  var isPresent = todayData[child.id] ? true : false;
  var checkTime = todayData[child.id] || "";
  var history = [];
  for (var i = 0; i < 14; i++) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var dateKey = d.toISOString().split("T")[0];
    var dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    var dayAtt = attendance[dateKey] || {};
    history.push({ date: dateKey, day: dayNames[d.getDay()], present: dayAtt[child.id] ? true : false, time: dayAtt[child.id] || "" });
  }
  var attendDays = history.filter(function(h) { return h.present; }).length;

  // Assignments
  var myA = allA.filter(function(a) { return a.classId === child.classId; });
  var assignmentList = myA.map(function(a) {
    var p = getPct(sp, child.id, a.id, a.items);
    return { id: a.id, title: a.title, desc: a.desc, color: a.color, date: a.date, pct: p, items: a.items, chTitle: a.chTitle };
  });
  var totalPct = assignmentList.length === 0 ? 0 : Math.round(assignmentList.reduce(function(s, a) { return s + a.pct; }, 0) / assignmentList.length);
  var completed = assignmentList.filter(function(a) { return a.pct === 100; }).length;

  return (
    <div>
      <div className="ph"><h2>👨‍👩‍👧 {child.name}의 학습 현황</h2><p>{child.classId} · {user.name} 학부모님</p></div>

      <div style={{ padding: 20, borderRadius: 16, marginBottom: 16, textAlign: "center", background: isPresent ? "var(--okb)" : "#fef2f4", border: "2px solid " + (isPresent ? "var(--ok)" : "#fecdd3") }}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>{isPresent ? "✅" : "⏳"}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: isPresent ? "var(--ok)" : "var(--pri)" }}>
          {isPresent ? "오늘 " + checkTime.replace("(자가)", "") + " 출석 완료!" + (checkTime.indexOf("(자가)") >= 0 ? " 📱자가출석" : "") : "오늘 아직 출석하지 않았습니다"}
        </div>
      </div>

      <div className="sg">
        <div className="sc"><div className="sl">과제 완료율</div><div className="sv a">{totalPct}%</div></div>
        <div className="sc"><div className="sl">완료 과제</div><div className="sv g">{completed}/{assignmentList.length}</div></div>
        <div className="sc"><div className="sl">2주 출석</div><div className="sv b">{attendDays}일</div></div>
      </div>

      <div style={{ padding: 10, borderRadius: 10, marginTop: 12, marginBottom: 4, fontSize: 11, background: "Notification" in window && Notification.permission === "granted" ? "#eff6ff" : "#fef3c7", border: "1px solid " + ("Notification" in window && Notification.permission === "granted" ? "#bfdbfe" : "#fde68a") }}>
        {"Notification" in window && Notification.permission === "granted" ? <span>🔔 출석 알림 활성화됨 — 자녀 출석 시 알림이 자동으로 옵니다</span>
        : <span>🔕 알림 비활성화 — <button onClick={function() { if ("Notification" in window) Notification.requestPermission(); }} style={{ background: "none", border: "none", color: "#2563eb", textDecoration: "underline", cursor: "pointer", fontSize: 11, fontFamily: "Noto Sans KR" }}>알림 허용하기</button></span>}
      </div>

      <div style={{ marginTop: 16, marginBottom: 8 }}><h3 style={{ fontSize: 14, fontWeight: 700 }}>📚 과제 진행 현황</h3></div>
      {assignmentList.length === 0 ? <div style={{ fontSize: 12, color: "var(--tx2)", padding: 10 }}>배정된 과제가 없습니다</div> :
        assignmentList.slice(0, 10).map(function(a) {
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ width: 5, height: 32, borderRadius: 3, background: a.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{a.title}</div>
                <div style={{ fontSize: 10, color: "var(--tx2)" }}>{a.desc} · {a.date}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: a.pct === 100 ? "var(--ok)" : a.pct > 0 ? "#d97706" : "var(--pri)" }}>{a.pct}%</div>
                <div style={{ fontSize: 9, color: "var(--tx2)" }}>{a.pct === 100 ? "완료" : a.pct > 0 ? "진행중" : "미시작"}</div>
              </div>
            </div>
          );
        })}

      <div style={{ marginTop: 20, marginBottom: 8 }}><h3 style={{ fontSize: 14, fontWeight: 700 }}>📅 최근 2주 출석 기록</h3></div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {history.map(function(h) {
          return (
            <div key={h.date} style={{ flex: "1 1 calc(14.28% - 4px)", minWidth: 38, padding: "6px 2px", textAlign: "center", borderRadius: 8, background: h.present ? "var(--okb)" : h.date === today ? "#fef2f4" : "#f9fafb", border: h.date === today ? "2px solid " + (h.present ? "var(--ok)" : "var(--pri)") : "1px solid var(--bdr)" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--tx2)" }}>{h.day}</div>
              <div style={{ fontSize: 9, color: "var(--tx2)" }}>{h.date.slice(5)}</div>
              <div style={{ fontSize: 14, marginTop: 1 }}>{h.present ? "✅" : h.date === today ? "⏳" : "—"}</div>
              {h.present && <div style={{ fontSize: 7, color: "var(--ok)" }}>{h.time}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 20, marginBottom: 8 }}><h3 style={{ fontSize: 14, fontWeight: 700 }}>💬 {homeroomLabel}과 메시지</h3></div>
      {homeroom.length === 0 && <div style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 6 }}>아직 담임이 배정되지 않았습니다. 메시지는 배정 후 전달됩니다.</div>}
      <div className="card">
        <MessageThread studentId={child.id} cur={user} messages={messages} onSend={onSend} />
      </div>
    </div>
  );
}

function AdminScores({ users, scores, setScores, forceSave, cur, counsels, setCounsels }) {
  var [counselModal, setCounselModal] = useState(null);
  var pendingFor = function(sid) { return (counsels || []).filter(function(c) { return c.studentId === sid && c.status === "needed"; }); };
  var openCounsel = function(student, reason) {
    var pend = pendingFor(student.id)[0];
    if (pend) { setCounselModal(pend); return; }
    var hr = findHomeroom(student, users);
    var rec = { id: "cs_" + mkid(), studentId: student.id, studentName: student.name, classId: student.classId, teacherId: hr ? hr.id : "", teacherName: hr ? hr.name : "", reason: reason || "수동 상담 요청", note: "", status: "needed", date: td(), by: cur ? { id: cur.id, role: cur.role, name: cur.name } : {} };
    setCounsels(function(p) { return (p || []).concat([rec]); });
    if (hr) fireNotif("상담 필요 — " + student.name, rec.reason + (hr ? " (담임 " + hr.name + ")" : ""));
    forceSave();
    setCounselModal(rec);
  };
  var saveCounsel = function(id, note) {
    setCounsels(function(p) { return (p || []).map(function(c) { return c.id === id ? Object.assign({}, c, { note: note, status: "done", doneDate: td(), doneBy: cur ? cur.name : "" }) : c; }); });
    setCounselModal(null); forceSave();
  };
  var [cf, setCf] = useState("all");
  var [selStu, setSelStu] = useState(null);
  var [cat, setCat] = useState("내신");
  var [selYear, setSelYear] = useState(new Date().getFullYear());
  var [showAdd, setShowAdd] = useState(false);
  var [showDownload, setShowDownload] = useState(false);
  var [dlExams, setDlExams] = useState([]);
  var [addMonth, setAddMonth] = useState(new Date().getMonth() + 1);
  var students = users.filter(function(u) { return u.role === "student"; });
  var classes = []; students.forEach(function(s) { if (classes.indexOf(s.classId) === -1) classes.push(s.classId); }); classes.sort();
  var filtered = cf === "all" ? students : students.filter(function(s) { return s.classId === cf; });

  var 내신과목 = ["수학", "과학"];
  var 모의과목 = ["국어", "수학", "영어", "통과", "통사"];
  var 학력과목 = ["수학"];
  var getSubjects = function(type) { return type === "내신" ? 내신과목 : type === "모의고사" ? 모의과목 : 학력과목; };

  var [addTitle, setAddTitle] = useState("");
  var [addDate, setAddDate] = useState(td().substring(0, 7));
  var [addGrades, setAddGrades] = useState({});

  // ── 반 일괄 성적 입력 ──
  var [showBulk, setShowBulk] = useState(false);
  var [bulkClass, setBulkClass] = useState("");
  var [bulkCat, setBulkCat] = useState("내신");
  var [bulkTitle, setBulkTitle] = useState("");
  var [bulkDate, setBulkDate] = useState(td().substring(0, 7));
  var [bulkMonth, setBulkMonth] = useState(new Date().getMonth() + 1);
  var [bulkGrades, setBulkGrades] = useState({});
  var openBulk = function() {
    var c = cf !== "all" ? cf : (classes[0] || "");
    setBulkClass(c); setBulkCat(cat); setBulkTitle(""); setBulkGrades({});
    setBulkDate(cat === "내신" ? (selYear + "-01") : td().substring(0, 7));
    setBulkMonth(new Date().getMonth() + 1);
    setShowBulk(true);
  };
  var setBulkCell = function(sid, sub, field, val) {
    setBulkGrades(function(p) {
      var n = JSON.parse(JSON.stringify(p));
      if (!n[sid]) n[sid] = {};
      if (!n[sid][sub]) n[sid][sub] = {};
      n[sid][sub][field] = val === "" ? "" : Number(val);
      return n;
    });
  };
  var saveBulk = function() {
    if (!bulkClass) { window.alert("반을 선택하세요."); return; }
    if (!bulkTitle.trim()) { window.alert("시험명을 입력하세요."); return; }
    var clsStudents = students.filter(function(s) { return s.classId === bulkClass; });
    var built = [];
    clsStudents.forEach(function(s) {
      var g = bulkGrades[s.id]; if (!g) return;
      var subjects = {};
      Object.keys(g).forEach(function(sub) {
        var gg = g[sub] || {};
        var hasG = gg.grade !== "" && gg.grade != null;
        var hasS = gg.score !== "" && gg.score != null;
        if (hasG || hasS) { subjects[sub] = {}; if (hasG) subjects[sub].grade = gg.grade; if (hasS) subjects[sub].score = gg.score; }
      });
      if (!Object.keys(subjects).length) return;
      var exam = { id: "ex_" + mkid(), type: bulkCat, title: bulkTitle.trim(), date: bulkDate, month: bulkCat === "학력평가" ? bulkMonth : 0, subjects: subjects };
      var prevExams = (scores[s.id] && scores[s.id].exams) ? scores[s.id].exams : [];
      var triggers = bulkCat === "내신" ? scoreCounselTriggers(exam, prevExams) : [];
      built.push({ student: s, exam: exam, triggers: triggers });
    });
    if (!built.length) { window.alert("입력된 성적이 없습니다."); return; }
    setScores(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      built.forEach(function(b) { if (!next[b.student.id]) next[b.student.id] = { exams: [], memo: "" }; next[b.student.id].exams.push(b.exam); });
      return next;
    });
    var triggered = built.filter(function(b) { return b.triggers.length; });
    if (triggered.length) {
      setCounsels(function(p) {
        var arr = (p || []).slice();
        triggered.forEach(function(b) {
          var hr = findHomeroom(b.student, users);
          var reason = "내신 " + b.exam.title + " — " + b.triggers.map(function(t) { return t.sub + " " + t.score + "점(" + t.reasons.join(", ") + ")"; }).join(" / ");
          arr.push({ id: "cs_" + mkid(), studentId: b.student.id, studentName: b.student.name, classId: b.student.classId, teacherId: hr ? hr.id : "", teacherName: hr ? hr.name : "", reason: reason, note: "", status: "needed", date: td(), by: cur ? { id: cur.id, role: cur.role, name: cur.name } : {} });
        });
        return arr;
      });
      fireNotif("⚠️ 상담 필요 " + triggered.length + "명", bulkClass + " " + bulkTitle.trim());
    }
    forceSave();
    setShowBulk(false); setBulkTitle(""); setBulkGrades({});
    window.alert(built.length + "명의 성적을 저장했습니다." + (triggered.length ? "\n⚠️ 상담필요 " + triggered.length + "명 발생 (담임에게 알림)" : ""));
  };

  var getStudentScores = function(sid) { return scores[sid] || { exams: [], memo: "" }; };
  var getExams = function(sid, type) { var s = getStudentScores(sid); return (s.exams || []).filter(function(e) { return e.type === type && e.date && e.date.substring(0, 4) === String(selYear); }); };
  var getExamCount = function(sid) { var s = getStudentScores(sid); return (s.exams || []).filter(function(e) { return e.date && e.date.substring(0, 4) === String(selYear); }).length; };
  var yearOptions = [];
  for (var yi = 2024; yi <= new Date().getFullYear() + 1; yi++) yearOptions.push(yi);
  var fmtDate = function(d, type) { if (!d) return ""; var parts = d.split("-"); if (type === "내신") return parts[0] + "년"; return parts[0] + "년 " + Number(parts[1]) + "월"; };
  var yearSelector = function() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={function() { setSelYear(function(y) { return y - 1; }); }} style={{ background: "none", border: "1px solid var(--bdr)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12, fontFamily: "Noto Sans KR" }}>◀</button>
        <span style={{ fontSize: 14, fontWeight: 800, minWidth: 50, textAlign: "center" }}>{selYear}년</span>
        <button onClick={function() { setSelYear(function(y) { return y + 1; }); }} style={{ background: "none", border: "1px solid var(--bdr)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12, fontFamily: "Noto Sans KR" }}>▶</button>
      </div>
    );
  };
  var getAllExamTitles = function() {
    var titles = [];
    Object.keys(scores).forEach(function(sid) {
      (scores[sid].exams || []).forEach(function(ex) {
        var key = ex.type + "|" + ex.title + "|" + ex.date;
        if (!titles.some(function(t) { return t.key === key; })) titles.push({ key: key, type: ex.type, title: ex.title, date: ex.date });
      });
    });
    titles.sort(function(a, b) { return a.date > b.date ? -1 : 1; });
    return titles.filter(function(t) { return t.date.substring(0, 4) === String(selYear); });
  };

  var addExam = function() {
    if (!selStu || !addTitle.trim()) return;
    var exam = { id: "ex_" + mkid(), type: cat, title: addTitle.trim(), date: addDate, month: cat === "학력평가" ? addMonth : 0, subjects: JSON.parse(JSON.stringify(addGrades)) };
    var prevExams = (scores[selStu] && scores[selStu].exams) ? scores[selStu].exams : [];
    setScores(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next[selStu]) next[selStu] = { exams: [], memo: "" };
      next[selStu].exams.push(exam);
      return next;
    });
    forceSave();
    setShowAdd(false); setAddTitle(""); setAddGrades({});
    // 내신 하락/70점 이하 → 상담필요 자동 감지
    if (cat === "내신") {
      var triggers = scoreCounselTriggers(exam, prevExams);
      if (triggers.length) {
        var stuObj = users.find(function(u) { return u.id === selStu; });
        var hr = findHomeroom(stuObj, users);
        var reason = "내신 " + exam.title + " — " + triggers.map(function(t) { return t.sub + " " + t.score + "점(" + t.reasons.join(", ") + ")"; }).join(" / ");
        var rec = { id: "cs_" + mkid(), studentId: selStu, studentName: stuObj ? stuObj.name : "", classId: stuObj ? stuObj.classId : "", teacherId: hr ? hr.id : "", teacherName: hr ? hr.name : "", reason: reason, note: "", status: "needed", date: td(), by: cur ? { id: cur.id, role: cur.role, name: cur.name } : {} };
        setCounsels(function(p) { return (p || []).concat([rec]); });
        fireNotif("⚠️ 상담 필요 — " + rec.studentName, reason + (hr ? " · 담임 " + hr.name : ""));
        forceSave();
        setTimeout(function() { setCounselModal(rec); }, 100);
      }
    }
  };

  var delExam = function(sid, examId) {
    if (!window.confirm("삭제할까요?")) return;
    setScores(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (next[sid]) next[sid].exams = (next[sid].exams || []).filter(function(e) { return e.id !== examId; });
      return next;
    }); forceSave();
  };

  var updateMemo = function(sid, memo) {
    setScores(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next[sid]) next[sid] = { exams: [], memo: "" };
      next[sid].memo = memo;
      return next;
    });
  };

  var downloadExcel = function() {
    if (dlExams.length === 0) { alert("다운로드할 시험을 선택하세요"); return; }
    var selExams = getAllExamTitles().filter(function(t) { return dlExams.indexOf(t.key) >= 0; });
    var header = ["학생명", "반", "학년"];
    selExams.forEach(function(ex) {
      var subs = getSubjects(ex.type);
      subs.forEach(function(sub) { header.push(ex.title + " " + sub + " 등급"); header.push(ex.title + " " + sub + " 원점수"); });
    });
    header.push("메모");
    var rows = [header];
    filtered.forEach(function(s) {
      var sd = getStudentScores(s.id);
      var row = [s.name, s.classId, ""];
      selExams.forEach(function(ex) {
        var subs = getSubjects(ex.type);
        var matched = (sd.exams || []).find(function(e) { return e.type === ex.type && e.title === ex.title && e.date === ex.date; });
        subs.forEach(function(sub) {
          if (matched && matched.subjects && matched.subjects[sub]) {
            row.push(matched.subjects[sub].grade || "");
            row.push(matched.subjects[sub].score || "");
          } else { row.push(""); row.push(""); }
        });
      });
      row.push(sd.memo || "");
      rows.push(row);
    });
    var csv = rows.map(function(r) { return r.map(function(c) { return String(c).indexOf(",") >= 0 ? ("\"" + c + "\"") : c; }).join(","); }).join("\n");
    var BOM = "\uFEFF";
    var blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = "성적_" + (cf === "all" ? "전체" : cf) + "_" + td() + ".csv"; a.click();
    URL.revokeObjectURL(url);
    setShowDownload(false);
  };

  var subjects = getSubjects(cat);

  // Student list view
  if (!selStu) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>📝 성적 관리</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{yearSelector()}<button className="btn btn-p btn-s" onClick={openBulk}>📋 반 일괄 입력</button><button className="btn btn-ok btn-s" onClick={function() { setShowDownload(true); setDlExams([]); }}>📥 성적 다운로드</button></div>
        </div>
        <div className="fb">
          <button className={cn("fc", cf === "all" && "on")} onClick={function() { setCf("all"); }}>전체</button>
          {classes.map(function(c) { return <button key={c} className={cn("fc", cf === c && "on")} onClick={function() { setCf(c); }}>{c}</button>; })}
        </div>
        {filtered.map(function(s) {
          var sd = getStudentScores(s.id);
          var examCount = getExamCount(s.id);
          var hasMemo = sd.memo ? true : false;
          return (
            <div key={s.id} onClick={function() { setSelStu(s.id); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}>
              <span style={{ fontSize: 18 }}>{s.avatar}</span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div><div style={{ fontSize: 10, color: "var(--tx2)" }}>{s.classId}</div></div>
              {examCount > 0 && <span style={{ fontSize: 10, padding: "2px 8px", background: "#eff6ff", borderRadius: 10, color: "#1e40af", fontWeight: 600 }}>시험 {examCount}건</span>}
              {hasMemo && <span style={{ fontSize: 10 }}>📝</span>}
              <span style={{ color: "var(--tx2)", fontSize: 12 }}>▶</span>
            </div>
          );
        })}

        {showDownload && <div className="mo" onClick={function() { setShowDownload(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 500, maxHeight: "80vh", overflow: "auto" }}>
          <h3>📥 성적 데이터 다운로드</h3>
          <p style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 12 }}>다운로드할 시험을 선택하세요. 선택한 시험의 등급/원점수가 CSV로 다운됩니다.</p>
          {getAllExamTitles().length === 0 ? <div style={{ padding: 16, textAlign: "center", color: "var(--tx2)" }}>등록된 시험이 없습니다</div> :
            getAllExamTitles().map(function(ex) {
              var isOn = dlExams.indexOf(ex.key) >= 0;
              var typeLabel = ex.type === "내신" ? "📖" : ex.type === "모의고사" ? "📝" : "🏫";
              return (
                <div key={ex.key} onClick={function() { setDlExams(function(p) { return isOn ? p.filter(function(k) { return k !== ex.key; }) : p.concat([ex.key]); }); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid #f3f4f6", cursor: "pointer", background: isOn ? "#eff6ff" : "#fff" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, border: isOn ? "2px solid var(--pri)" : "2px solid #d1d5db", background: isOn ? "var(--pri)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{isOn && <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>✓</span>}</div>
                  <span>{typeLabel}</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{ex.title}</div><div style={{ fontSize: 10, color: "var(--tx2)" }}>{fmtDate(ex.date, ex.type)} · {ex.type}</div></div>
                </div>
              );
            })
          }
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--tx2)" }}>선택: {dlExams.length}개 시험 · 대상: {filtered.length}명 ({cf === "all" ? "전체" : cf})</div>
          <div className="br"><button className="btn btn-g" onClick={function() { setShowDownload(false); }}>취소</button><button className="btn btn-p" onClick={downloadExcel}>📥 CSV 다운로드</button></div>
        </div></div>}

        {showBulk && <div className="mo" onClick={function() { setShowBulk(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 680, maxHeight: "85vh", overflow: "auto" }}>
          <h3>📋 반 일괄 성적 입력</h3>
          <p style={{ fontSize: 12, color: "var(--tx2)", margin: "4px 0 10px" }}>같은 반 학생들의 한 시험 성적을 한 화면에서 입력합니다.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div className="fg" style={{ flex: "1 1 110px" }}><label>반</label>
              <select value={bulkClass} onChange={function(e) { setBulkClass(e.target.value); }}>{classes.map(function(c) { return <option key={c} value={c}>{c}</option>; })}</select></div>
            <div className="fg" style={{ flex: "1 1 110px" }}><label>시험 종류</label>
              <select value={bulkCat} onChange={function(e) { var v = e.target.value; setBulkCat(v); setBulkDate(v === "내신" ? (selYear + "-01") : td().substring(0, 7)); }}>
                <option value="내신">내신</option><option value="모의고사">모의고사</option><option value="학력평가">학력평가</option></select></div>
            <div className="fg" style={{ flex: "2 1 140px" }}><label>시험명</label>
              <input value={bulkTitle} onChange={function(e) { setBulkTitle(e.target.value); }} placeholder={bulkCat === "내신" ? "1학기 중간고사" : bulkCat === "모의고사" ? "6월 모의고사" : "3월 학력평가"} /></div>
            {bulkCat === "내신"
              ? <div className="fg" style={{ flex: "1 1 80px" }}><label>연도</label><select value={bulkDate.substring(0, 4)} onChange={function(e) { setBulkDate(e.target.value + "-01"); }}>{yearOptions.map(function(y) { return <option key={y} value={y}>{y}년</option>; })}</select></div>
              : <div className="fg" style={{ flex: "1 1 110px" }}><label>년/월</label><input type="month" value={bulkDate} onChange={function(e) { setBulkDate(e.target.value); }} /></div>}
            {bulkCat === "학력평가" && <div className="fg" style={{ flex: "1 1 70px" }}><label>월</label><select value={bulkMonth} onChange={function(e) { setBulkMonth(Number(e.target.value)); }}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) { return <option key={m} value={m}>{m}월</option>; })}</select></div>}
          </div>
          {(function() {
            var subs = getSubjects(bulkCat);
            var clsStudents = students.filter(function(s) { return s.classId === bulkClass; });
            if (!clsStudents.length) return <div style={{ padding: 20, textAlign: "center", color: "var(--tx2)" }}>이 반에 학생이 없습니다.</div>;
            return (
              <div style={{ overflowX: "auto", marginTop: 4 }}>
                <div style={{ minWidth: 92 + subs.length * 130 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, padding: "6px 0", borderBottom: "2px solid var(--bdr)", fontSize: 11, fontWeight: 700, color: "var(--tx2)" }}>
                    <div style={{ width: 84 }}>학생</div>
                    {subs.map(function(sub) { return <div key={sub} style={{ width: 124, textAlign: "center" }}>{sub}<div style={{ fontWeight: 500, fontSize: 10 }}>등급 / 원점수</div></div>; })}
                  </div>
                  {clsStudents.map(function(s) {
                    return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ width: 84, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      {subs.map(function(sub) {
                        var cell = (bulkGrades[s.id] || {})[sub] || {};
                        return <div key={sub} style={{ width: 124, display: "flex", gap: 4, justifyContent: "center" }}>
                          <input type="number" min="1" max="9" value={cell.grade == null ? "" : cell.grade} onChange={function(e) { setBulkCell(s.id, sub, "grade", e.target.value); }} placeholder="등급" style={{ width: 52, padding: "5px", border: "1px solid var(--bdr)", borderRadius: 6, fontSize: 12, textAlign: "center", fontFamily: "Noto Sans KR" }} />
                          <input type="number" min="0" max="100" value={cell.score == null ? "" : cell.score} onChange={function(e) { setBulkCell(s.id, sub, "score", e.target.value); }} placeholder="점수" style={{ width: 58, padding: "5px", border: "1px solid var(--bdr)", borderRadius: 6, fontSize: 12, textAlign: "center", fontFamily: "Noto Sans KR" }} />
                        </div>;
                      })}
                    </div>;
                  })}
                </div>
              </div>
            );
          })()}
          <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 8 }}>＊ 값을 입력한 학생만 저장됩니다. 내신은 70점 이하·이전보다 하락 시 자동으로 상담필요가 생성됩니다.</div>
          <div className="br"><button className="btn btn-g" onClick={function() { setShowBulk(false); }}>취소</button><button className="btn btn-p" onClick={saveBulk}>일괄 저장</button></div>
        </div></div>}
      </div>
    );
  }

  // Student detail view
  var stu = students.find(function(s) { return s.id === selStu; });
  if (!stu) { setSelStu(null); return null; }
  var sd = getStudentScores(selStu);
  var exams = getExams(selStu, cat);
  if (cat === "학력평가") {
    exams = exams.sort(function(a, b) { return (a.month || 0) - (b.month || 0); });
  }

  return (
    <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div><h3 style={{ fontSize: 15, fontWeight: 700 }}>{stu.avatar} {stu.name}의 성적</h3><div style={{ fontSize: 11, color: "var(--tx2)" }}>{stu.classId}</div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{yearSelector()}<button className="btn btn-p btn-s" onClick={function() { setShowAdd(true); setAddGrades({}); setAddTitle(""); }}>+ 시험 추가</button><button className="btn btn-g btn-s" onClick={function() { setSelStu(null); }}>← 목록</button></div>
        </div>

      <div className="fg" style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700 }}>📝 기타 메모</label>
        <textarea value={sd.memo || ""} onChange={function(e) { updateMemo(selStu, e.target.value); }} onBlur={function() { forceSave(); }} placeholder="학생에 대한 메모 (예: 수학 보충 필요, 태도 우수...)" style={{ width: "100%", minHeight: 60, padding: 8, border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12, fontFamily: "Noto Sans KR", resize: "vertical" }} />
      </div>

      {(function() {
        var pend = pendingFor(selStu);
        var done = (counsels || []).filter(function(c) { return c.studentId === selStu && c.status === "done"; });
        return (
          <div style={{ marginBottom: 14 }}>
            {pend.map(function(c) {
              return <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>상담 필요</div><div style={{ fontSize: 11.5, color: "#7f1d1d" }}>{c.reason}</div></div>
                <button className="btn btn-p btn-s" onClick={function() { setCounselModal(c); }}>상담 기록</button>
              </div>;
            })}
            <button className="btn btn-g btn-s" style={{ color: "#dc2626", borderColor: "#fecaca" }} onClick={function() { openCounsel(stu, "수동 상담 요청"); }}>📋 상담필요 등록</button>
            {done.length > 0 && <span style={{ fontSize: 11, color: "var(--ok)", marginLeft: 8 }}>✓ 상담 완료 {done.length}건</span>}
          </div>
        );
      })()}

      <div className="fb" style={{ marginBottom: 14 }}>
        <button className={cn("fc", cat === "내신" && "on")} onClick={function() { setCat("내신"); }}>📖 내신</button>
        <button className={cn("fc", cat === "모의고사" && "on")} onClick={function() { setCat("모의고사"); }}>📝 모의고사</button>
        <button className={cn("fc", cat === "학력평가" && "on")} onClick={function() { setCat("학력평가"); }}>🏫 학력평가</button>
      </div>

      {cat === "학력평가" && <div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 8 }}>💡 학력평가는 월별로 관리됩니다.</div>}

      {exams.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "var(--tx2)", fontSize: 12 }}>등록된 {cat} 시험이 없습니다</div> :
        exams.map(function(ex) {
          var subs = getSubjects(ex.type);
          return (
            <div key={ex.id} className="card" style={{ marginBottom: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{ex.title}{ex.month ? " (" + ex.month + "월)" : ""}</div>
                  <div style={{ fontSize: 10, color: "var(--tx2)" }}>{fmtDate(ex.date, ex.type)}</div>
                </div>
                <button className="btn-d" onClick={function() { delExam(selStu, ex.id); }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {subs.map(function(sub) {
                  var subData = (ex.subjects || {})[sub] || {};
                  var grade = subData.grade || "-";
                  var score = subData.score || "-";
                  var gn = Number(grade);
                  return (
                    <div key={sub} style={{ flex: "1 1 70px", padding: "8px 4px", textAlign: "center", background: "#f9fafb", borderRadius: 8, minWidth: 65 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx2)", marginBottom: 4 }}>{sub}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: gn >= 1 && gn <= 3 ? "var(--ok)" : gn >= 4 && gn <= 5 ? "#d97706" : gn >= 6 ? "var(--pri)" : "var(--tx2)" }}>{grade}<span style={{ fontSize: 9, color: "var(--tx2)" }}>등급</span></div>
                      <div style={{ fontSize: 11, color: "var(--tx2)" }}>{score}점</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      }

      {counselModal && <CounselModal counsel={counselModal} onClose={function() { setCounselModal(null); }} onSave={function(note) { saveCounsel(counselModal.id, note); }} />}

      {showAdd && <div className="mo" onClick={function() { setShowAdd(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 500 }}>
        <h3>{cat} 시험 추가</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <div className="fg" style={{ flex: "2 1 140px" }}><label>시험명</label><input value={addTitle} onChange={function(e) { setAddTitle(e.target.value); }} placeholder={cat === "내신" ? "1학기 중간고사" : cat === "모의고사" ? "6월 모의고사" : "3월 학력평가"} /></div>
          {cat === "내신" ? <div className="fg" style={{ flex: "1 1 80px" }}><label>연도</label><select value={addDate.substring(0,4)} onChange={function(e) { setAddDate(e.target.value + "-01"); }}>{yearOptions.map(function(y) { return <option key={y} value={y}>{y}년</option>; })}</select></div>
          : <div className="fg" style={{ flex: "1 1 100px" }}><label>년/월</label><input type="month" value={addDate} onChange={function(e) { setAddDate(e.target.value); }} /></div>}
          {cat === "학력평가" && <div className="fg" style={{ flex: "1 1 70px" }}><label>월</label><select value={addMonth} onChange={function(e) { setAddMonth(Number(e.target.value)); }}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) { return <option key={m} value={m}>{m}월</option>; })}</select></div>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>과목별 등급 / 원점수</div>
        {subjects.map(function(sub) {
          var g = (addGrades[sub] || {}).grade || "";
          var s = (addGrades[sub] || {}).score || "";
          return (
            <div key={sub} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 40, fontSize: 12, fontWeight: 700 }}>{sub}</span>
              <input type="number" min="1" max="9" value={g} onChange={function(e) { setAddGrades(function(p) { var n = JSON.parse(JSON.stringify(p)); if (!n[sub]) n[sub] = {}; n[sub].grade = e.target.value ? Number(e.target.value) : ""; return n; }); }} placeholder="등급" style={{ width: 60, padding: "6px", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12, textAlign: "center", fontFamily: "Noto Sans KR" }} />
              <input type="number" min="0" max="100" value={s} onChange={function(e) { setAddGrades(function(p) { var n = JSON.parse(JSON.stringify(p)); if (!n[sub]) n[sub] = {}; n[sub].score = e.target.value ? Number(e.target.value) : ""; return n; }); }} placeholder="원점수" style={{ width: 70, padding: "6px", border: "1px solid var(--bdr)", borderRadius: "var(--rs)", fontSize: 12, textAlign: "center", fontFamily: "Noto Sans KR" }} />
            </div>
          );
        })}
        <div className="br"><button className="btn btn-g" onClick={function() { setShowAdd(false); }}>취소</button><button className="btn btn-p" onClick={addExam}>저장</button></div>
      </div></div>}
    </div>
  );
}


function AdminAttendance({ users, attendance, setAttendance, forceSave, selfCodes, setSelfCodes }) {
  var todayCode = (selfCodes && selfCodes[td()]) || "";
  var regenCode = function() {
    if (!window.confirm("오늘의 자가출석 코드를 새로 발급할까요?\n기존 코드는 더 이상 사용할 수 없게 됩니다.")) return;
    var t = td();
    setSelfCodes(function(prev) {
      var next = Object.assign({}, prev || {});
      next[t] = genCode();
      return next;
    });
    forceSave();
  };
  var [cf, setCf] = useState("all");
  var [selDate, setSelDate] = useState(td());
  var [kiosk, setKiosk] = useState(false);
  var [kioskPin, setKioskPin] = useState("");
  var [kioskMsg, setKioskMsg] = useState(null);
  var [kioskChoices, setKioskChoices] = useState(null);
  var [lateTime, setLateTime] = useState(function() { try { return localStorage.getItem("rt_lateTime") || ""; } catch(e) { return ""; } });
  var [lateSettings, setLateSettings] = useState(function() { try { var s = localStorage.getItem("rt_lateSettings"); return s ? JSON.parse(s) : { classes: {}, students: {} }; } catch(e) { return { classes: {}, students: {} }; } });
  var [showLateSetting, setShowLateSetting] = useState(false);
  var saveLateTime = function(t) { setLateTime(t); try { localStorage.setItem("rt_lateTime", t); } catch(e) {} };
  var saveLateSettings = function(s) { setLateSettings(s); try { localStorage.setItem("rt_lateSettings", JSON.stringify(s)); } catch(e) {} };
  var dayLabels = ["일","월","화","수","목","금","토"];
  var todayDow = new Date().getDay();

  var getLateTimeFor = function(student) {
    // Priority: student > class > default
    var dow = todayDow;
    // Check student-specific
    var stu = lateSettings.students && lateSettings.students[student.id];
    if (stu) { if (stu.days && stu.days[dow]) return stu.days[dow]; if (stu.time) return stu.time; }
    // Check class-specific
    var cls = lateSettings.classes && lateSettings.classes[student.classId];
    if (cls) { if (cls.days && cls.days[dow]) return cls.days[dow]; if (cls.time) return cls.time; }
    // Default
    return lateTime || "";
  };
  var isLate = function(checkTime, student) {
    if (!checkTime) return false;
    var t = checkTime.replace("(자가)", "");
    var lt = student ? getLateTimeFor(student) : lateTime;
    if (!lt) return false;
    return t > lt;
  };
  var isSelf = function(checkTime) { return checkTime && checkTime.indexOf("(자가)") >= 0; };
  var pureTime = function(checkTime) { return checkTime ? checkTime.replace("(자가)", "") : ""; };
  var hasClassToday = function(student) {
    var dow = new Date(selDate).getDay();
    // Check student-specific days
    var stu = lateSettings.students && lateSettings.students[student.id];
    if (stu && stu.days && Object.keys(stu.days).length > 0) return stu.days[dow] ? true : false;
    // Check class-specific days
    var cls = lateSettings.classes && lateSettings.classes[student.classId];
    if (cls && cls.days && Object.keys(cls.days).length > 0) return cls.days[dow] ? true : false;
    // No schedule set → show all
    return true;
  };
  var students = users.filter(function(u) { return u.role === "student"; });
  var classes = []; students.forEach(function(s) { if (classes.indexOf(s.classId) === -1) classes.push(s.classId); }); classes.sort();
  var filtered = cf === "all" ? students : students.filter(function(s) { return s.classId === cf; });
  var todayFiltered = filtered.filter(function(s) { return hasClassToday(s); });
  var selDayData = attendance[selDate] || {};
  var todayData = attendance[td()] || {};
  var presentCount = todayFiltered.filter(function(s) { return selDayData[s.id]; }).length;
  var lateCount = todayFiltered.filter(function(s) { return selDayData[s.id] && isLate(selDayData[s.id], s); }).length;
  var absentCount = todayFiltered.length - presentCount;
  var pct = todayFiltered.length === 0 ? 0 : Math.round((presentCount / todayFiltered.length) * 100);

  var toggleAttend = function(sid) {
    setAttendance(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next[selDate]) next[selDate] = {};
      if (next[selDate][sid]) { delete next[selDate][sid]; } else { next[selDate][sid] = new Date().toTimeString().slice(0, 5); }
      return next;
    });
    forceSave();
  };

  var doKioskCheckIn = function(student) {
    var today = td();
    var alreadyDone = attendance[today] && attendance[today][student.id];
    if (alreadyDone) {
      setKioskMsg({ type: "already", text: student.name + " (" + student.classId + ")", sub: "이미 출석했습니다 (" + alreadyDone + ")", avatar: student.avatar });
    } else {
      var now = new Date().toTimeString().slice(0, 5);
      var late = isLate(now, student);
      setAttendance(function(prev) {
        var next = JSON.parse(JSON.stringify(prev));
        if (!next[today]) next[today] = {};
        next[today][student.id] = now;
        return next;
      });
      forceSave();
      setKioskMsg({ type: late ? "late" : "ok", text: student.name + " (" + student.classId + ")", sub: late ? "지각 출석! (" + now + ")" : "출석 완료! (" + now + ")", avatar: student.avatar });
    }
    setKioskPin("");
    setKioskChoices(null);
    setTimeout(function() { setKioskMsg(null); }, 2500);
  };

  var kioskCheckIn = function(pin) {
    var matched = students.filter(function(s) { return s.password === pin; });
    if (matched.length === 0) {
      setKioskMsg({ type: "error", text: "등록되지 않은 비밀번호", sub: "다시 입력해주세요" });
      setKioskPin("");
      setTimeout(function() { setKioskMsg(null); }, 2000);
    } else if (matched.length === 1) {
      doKioskCheckIn(matched[0]);
    } else {
      setKioskChoices(matched);
    }
  };

  var kioskKeyPad = function(n) {
    if (n === "back") { setKioskPin(function(p) { return p.slice(0, -1); }); return; }
    setKioskPin(function(p) {
      var nv = p + n;
      if (nv.length === 4) setTimeout(function() { kioskCheckIn(nv); }, 150);
      return nv.slice(0, 4);
    });
  };

  if (kiosk) {
    return (
      <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, position: "relative" }}>
        <div style={{ position: "absolute", top: 10, right: 10 }}><button className="btn btn-g" onClick={function() { setKiosk(false); setKioskPin(""); setKioskMsg(null); setKioskChoices(null); }}>✕ 종료</button></div>

        {kioskMsg ? (
          <div style={{ textAlign: "center", padding: 30 }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>{kioskMsg.type === "ok" ? "✅" : kioskMsg.type === "late" ? "⏰" : kioskMsg.type === "already" ? "🔔" : "❌"}</div>
            {kioskMsg.avatar && <div style={{ fontSize: 48, marginBottom: 8 }}>{kioskMsg.avatar}</div>}
            <div style={{ fontSize: 24, fontWeight: 800, color: kioskMsg.type === "ok" ? "var(--ok)" : kioskMsg.type === "late" ? "#d97706" : kioskMsg.type === "already" ? "#d97706" : "var(--pri)" }}>{kioskMsg.text}</div>
            <div style={{ fontSize: 16, color: "var(--tx2)", marginTop: 4 }}>{kioskMsg.sub}</div>
          </div>
        ) : kioskChoices ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>이름을 선택하세요</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              {kioskChoices.map(function(s) {
                return <button key={s.id} onClick={function() { doKioskCheckIn(s); }} style={{ padding: "20px 28px", borderRadius: 16, border: "2px solid var(--bdr)", background: "var(--card)", fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "Noto Sans KR" }}>{s.avatar} {s.name}<br /><span style={{ fontSize: 13, color: "var(--tx2)" }}>{s.classId}</span></button>;
              })}
            </div>
            <button className="btn btn-g" style={{ marginTop: 20 }} onClick={function() { setKioskChoices(null); setKioskPin(""); }}>취소</button>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>출석 체크</div>
            <div style={{ fontSize: 15, color: "var(--tx2)", marginBottom: 24 }}>비밀번호 4자리를 눌러주세요</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 24 }}>
              {[0,1,2,3].map(function(i) {
                return <div key={i} style={{ width: 52, height: 64, borderRadius: 14, border: "3px solid " + (kioskPin.length > i ? "var(--pri)" : "#d1d5db"), background: kioskPin.length > i ? "var(--prib)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, transition: "all 0.15s" }}>{kioskPin.length > i ? "●" : ""}</div>;
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 76px)", gap: 10, justifyContent: "center" }}>
              {[1,2,3,4,5,6,7,8,9,"",0,"back"].map(function(n) {
                if (n === "") return <div key="empty" />;
                return <button key={n} onClick={function() { kioskKeyPad(n); }} style={{ width: 76, height: 60, borderRadius: 14, border: "1px solid var(--bdr)", background: n === "back" ? "#fee2e2" : "var(--card)", fontSize: n === "back" ? 22 : 26, fontWeight: 700, cursor: "pointer", fontFamily: "Noto Sans KR", color: n === "back" ? "#dc2626" : "var(--tx)" }}>{n === "back" ? "⌫" : n}</button>;
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  var prevDay = function() { var d = new Date(selDate); d.setDate(d.getDate() - 1); setSelDate(d.toISOString().split("T")[0]); };
  var nextDay = function() { var d = new Date(selDate); d.setDate(d.getDate() + 1); setSelDate(d.toISOString().split("T")[0]); };
  var dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  var dayOfWeek = dayNames[new Date(selDate).getDay()];
  var isToday = selDate === td();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div><h3 style={{ fontSize: 15, fontWeight: 700 }}>📋 출석 관리</h3></div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--tx2)" }}>기본마감:</span>
          <input type="time" value={lateTime} onChange={function(e) { saveLateTime(e.target.value); }} style={{ padding: "4px 6px", border: "1px solid var(--bdr)", borderRadius: 6, fontSize: 11, fontFamily: "'Noto Sans KR'" }} />
          {lateTime && <button onClick={function() { saveLateTime(""); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#dc2626" }}>✕</button>}
          <button className="btn btn-g btn-s" onClick={function() { setShowLateSetting(true); }}>⚙ 반별/학생별</button>
          <button className="btn btn-p btn-s" onClick={function() { setKiosk(true); setKioskPin(""); setKioskMsg(null); }}>📱 키오스크</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", marginBottom: 14, background: "linear-gradient(135deg, #ede9fe, #f5f3ff)", border: "2px solid #c4b5fd", borderRadius: "var(--r)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>📱</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9" }}>오늘의 자가출석 코드</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 6, color: "#5b21b6", fontFamily: "'Noto Sans KR'" }}>{todayCode || "----"}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <button className="btn btn-g btn-s" onClick={regenCode}>🔄 재발급</button>
          <div style={{ fontSize: 9, color: "var(--tx2)", marginTop: 4, maxWidth: 130 }}>학생이 자가출석 시 입력합니다. 학원에서만 보여주세요.</div>
        </div>
      </div>

      {showLateSetting && <div className="mo" onClick={function() { setShowLateSetting(false); }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 600, maxHeight: "80vh", overflow: "auto" }}>
        <h3>⚙ 등원마감 상세 설정</h3>
        <p style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 12 }}>우선순위: 학생별 설정 → 반별 설정 → 기본 마감시간</p>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏫 반별 등원마감</div>
        {classes.map(function(cls) {
          var cs = (lateSettings.classes && lateSettings.classes[cls]) || {};
          return (
            <div key={cls} style={{ marginBottom: 10, padding: 10, background: "#f9fafb", borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{cls}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                {dayLabels.map(function(dl, di) {
                  var dayTime = (cs.days && cs.days[di]) || "";
                  var isSet = dayTime !== "";
                  return (
                    <div key={di} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: di === 0 ? "#dc2626" : di === 6 ? "#2563eb" : "var(--tx)" }}>{dl}</span>
                      <input type="time" value={dayTime} onChange={function(e) {
                        var next = JSON.parse(JSON.stringify(lateSettings));
                        if (!next.classes) next.classes = {};
                        if (!next.classes[cls]) next.classes[cls] = { days: {} };
                        if (!next.classes[cls].days) next.classes[cls].days = {};
                        if (e.target.value) next.classes[cls].days[di] = e.target.value;
                        else delete next.classes[cls].days[di];
                        saveLateSettings(next);
                      }} style={{ width: 70, padding: "2px 4px", border: "1px solid " + (isSet ? "var(--pri)" : "var(--bdr)"), borderRadius: 4, fontSize: 10, fontFamily: "'Noto Sans KR'", background: isSet ? "#fef2f2" : "#fff" }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>🎒 학생별 등원마감 (개별 설정)</div>
        <div style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 8 }}>특정 학생만 다른 마감시간이 필요할 때 설정합니다.</div>
        {(function() {
          var setStudents = Object.keys(lateSettings.students || {});
          return setStudents.length === 0 ? <div style={{ fontSize: 11, color: "var(--tx2)", padding: 8 }}>개별 설정된 학생이 없습니다</div> :
            setStudents.map(function(sid) {
              var stu = students.find(function(s) { return s.id === sid; });
              var ss = lateSettings.students[sid] || {};
              return (
                <div key={sid} style={{ marginBottom: 8, padding: 8, background: "#eff6ff", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{stu ? stu.name : sid}</span>
                  <input type="time" value={ss.time || ""} onChange={function(e) {
                    var next = JSON.parse(JSON.stringify(lateSettings));
                    if (!next.students[sid]) next.students[sid] = {};
                    next.students[sid].time = e.target.value;
                    saveLateSettings(next);
                  }} style={{ width: 80, padding: "3px", border: "1px solid var(--bdr)", borderRadius: 4, fontSize: 11, fontFamily: "'Noto Sans KR'" }} />
                  <button onClick={function() {
                    var next = JSON.parse(JSON.stringify(lateSettings));
                    delete next.students[sid];
                    saveLateSettings(next);
                  }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 11 }}>✕ 삭제</button>
                </div>
              );
            });
        })()}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <select id="addStuLate" style={{ flex: 1, padding: "6px", border: "1px solid var(--bdr)", borderRadius: 6, fontSize: 11, fontFamily: "'Noto Sans KR'" }}>
            <option value="">-- 학생 선택 --</option>
            {students.filter(function(s) { return !(lateSettings.students && lateSettings.students[s.id]); }).map(function(s) { return <option key={s.id} value={s.id}>{s.name} ({s.classId})</option>; })}
          </select>
          <button className="btn btn-ok btn-s" onClick={function() {
            var sel = document.getElementById("addStuLate");
            if (!sel.value) return;
            var next = JSON.parse(JSON.stringify(lateSettings));
            if (!next.students) next.students = {};
            next.students[sel.value] = { time: lateTime || "16:00" };
            saveLateSettings(next);
            sel.value = "";
          }}>+ 추가</button>
        </div>

        <div className="br" style={{ marginTop: 16 }}><button className="btn btn-g" onClick={function() { setShowLateSetting(false); }}>닫기</button></div>
      </div></div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, justifyContent: "center" }}>
        <button className="btn btn-g btn-s" onClick={prevDay}>◀</button>
        <div style={{ textAlign: "center", minWidth: 140 }}>
          <input type="date" value={selDate} onChange={function(e) { setSelDate(e.target.value); }} style={{ border: "1px solid var(--bdr)", borderRadius: "var(--rs)", padding: "6px 10px", fontSize: 13, fontFamily: "Noto Sans KR", fontWeight: 600 }} />
          <div style={{ fontSize: 11, color: isToday ? "var(--pri)" : "var(--tx2)", fontWeight: isToday ? 700 : 400, marginTop: 2 }}>{dayOfWeek}요일{isToday ? " (오늘)" : ""}</div>
        </div>
        <button className="btn btn-g btn-s" onClick={nextDay}>▶</button>
      </div>

      <div className="sg">
        <div className="sc"><div className="sl">결석</div><div className="sv r">{absentCount}명</div></div>
        {lateCount > 0 && <div className="sc"><div className="sl">지각</div><div className="sv" style={{ color: "#d97706" }}>{lateCount}명</div></div>}
      </div>

      <div className="fb">
        <button className={cn("fc", cf === "all" && "on")} onClick={function() { setCf("all"); }}>전체</button>
        {classes.map(function(c) { return <button key={c} className={cn("fc", cf === c && "on")} onClick={function() { setCf(c); }}>{c}</button>; })}
      </div>

      <div className="card">
        <div style={{ display: "flex", padding: "8px 4px", borderBottom: "2px solid var(--bdr)", fontSize: 10, fontWeight: 700, color: "var(--tx2)" }}>
          <div style={{ flex: 1 }}>학생</div>
          <div style={{ width: 60, textAlign: "center" }}>상태</div>
          <div style={{ width: 50, textAlign: "center" }}>시간</div>
        </div>
        {todayFiltered.map(function(s) {
          var isPresent = selDayData[s.id] ? true : false;
          var checkTime = selDayData[s.id] || "";
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "10px 4px", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 16, marginRight: 8 }}>{s.avatar}</span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div><div style={{ fontSize: 10, color: "var(--tx2)" }}>{s.classId}</div></div>
              <div style={{ width: 60, textAlign: "center" }}>
                <div onClick={function() { toggleAttend(s.id); }} style={{ width: 30, height: 30, borderRadius: 8, border: isPresent ? "2px solid var(--ok)" : "2px solid #d1d5db", background: isPresent ? "var(--ok)" : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{isPresent && <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>✓</span>}</div>
              </div>
              <div style={{ width: 80, textAlign: "center", fontSize: 10, fontWeight: 600 }}>{isPresent ? (<span>{isLate(checkTime, s) ? <span style={{ color: "#dc2626" }}>⏰ {pureTime(checkTime)}</span> : <span style={{ color: "var(--ok)" }}>{pureTime(checkTime)}</span>}{isSelf(checkTime) && <span style={{ fontSize: 8, color: "#7c3aed", marginLeft: 2 }}>📱자가</span>}</span>) : <span style={{ color: "var(--tx2)" }}>-</span>}</div>
            </div>
          );
        })}
      </div>

      <div className="hint" style={{ marginTop: 14 }}>💡 관리자가 직접 체크하거나, 학생이 키오스크에서 비밀번호로, 또는 오늘의 코드로 자가출석할 수 있습니다. 출석 시간이 자동 기록됩니다.</div>
    </div>
  );
}

function StudentAttendance({ user, attendance, setAttendance, forceSave, selfCodes }) {
  var [pin, setPin] = useState("");
  var [msg, setMsg] = useState("");
  var today = td();
  var todayData = attendance[today] || {};
  var isCheckedIn = todayData[user.id] ? true : false;
  var checkTime = todayData[user.id] || "";

  // Check if self-attendance is allowed (only after scheduled time)
  var now = new Date().toTimeString().slice(0, 5);
  var dow = new Date().getDay();
  var scheduledTime = "";
  try {
    var lt = localStorage.getItem("rt_lateTime") || "";
    var ls = localStorage.getItem("rt_lateSettings");
    var settings = ls ? JSON.parse(ls) : { classes: {}, students: {} };
    // Priority: student > class > default
    var stuSetting = settings.students && settings.students[user.id];
    if (stuSetting) { scheduledTime = (stuSetting.days && stuSetting.days[dow]) || stuSetting.time || lt; }
    else {
      var clsSetting = settings.classes && settings.classes[user.classId];
      if (clsSetting) { scheduledTime = (clsSetting.days && clsSetting.days[dow]) || clsSetting.time || lt; }
      else { scheduledTime = lt; }
    }
  } catch(e) {}
  var selfAllowed = !scheduledTime || now >= scheduledTime;

  var doCheckIn = function() {
    var todayCode = (selfCodes && selfCodes[today]) || "";
    if (!todayCode) { setMsg("❌ 오늘의 코드가 아직 발급되지 않았습니다. 데스크에 문의하세요"); setPin(""); return; }
    if (pin !== todayCode) { setMsg("❌ 코드가 일치하지 않습니다"); setPin(""); return; }
    setAttendance(function(prev) {
      var next = JSON.parse(JSON.stringify(prev));
      if (!next[today]) next[today] = {};
      next[today][user.id] = new Date().toTimeString().slice(0, 5) + "(자가)";
      return next;
    });
    forceSave();
    setPin("");
    setMsg("✅ 출석 완료!");
    setTimeout(function() { setMsg(""); }, 3000);
  };

  // Recent attendance history (last 7 days)
  var history = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var dateKey = d.toISOString().split("T")[0];
    var dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    var dayData = attendance[dateKey] || {};
    history.push({ date: dateKey, day: dayNames[d.getDay()], present: dayData[user.id] ? true : false, time: dayData[user.id] || "" });
  }

  return (
    <div>
      {isCheckedIn ? (
        <div style={{ padding: 24, borderRadius: "var(--r)", marginBottom: 14, textAlign: "center", background: "var(--okb)", border: "2px solid var(--ok)" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ok)" }}>출석 완료!</div>
          <div style={{ fontSize: 14, color: "var(--tx2)", marginTop: 4 }}>오늘 {checkTime.replace("(자가)", "")}에 출석했습니다{checkTime.indexOf("(자가)") >= 0 && " (자가출석)"}</div>
        </div>
      ) : !selfAllowed ? (
        <div style={{ padding: 24, borderRadius: "var(--r)", marginBottom: 14, textAlign: "center", background: "#f9fafb", border: "2px solid var(--bdr)" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🏫</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--tx2)", marginBottom: 8 }}>학원에서 출석해주세요</div>
          <div style={{ fontSize: 12, color: "var(--tx2)" }}>키오스크에서 비밀번호를 입력하여 출석하세요</div>
          <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 12, padding: "8px 12px", background: "#eff6ff", borderRadius: 8, display: "inline-block" }}>📱 자가 출석은 <strong>{scheduledTime}</strong> 이후 가능합니다</div>
        </div>
      ) : (
        <div style={{ padding: 24, borderRadius: "var(--r)", marginBottom: 14, textAlign: "center", background: "#fef2f4", border: "2px solid var(--pri)" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📱</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--pri)", marginBottom: 4 }}>자가 출석</div>
          <div style={{ fontSize: 11, color: "var(--tx2)", marginBottom: 16 }}>등원시간이 지났습니다. 데스크에 안내된 <strong>오늘의 코드</strong>를 입력하세요.</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
            <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={function(e) { setPin(e.target.value.replace(/[^0-9]/g, "")); setMsg(""); }} onKeyDown={function(e) { if (e.key === "Enter" && pin.length >= 4) doCheckIn(); }} placeholder="••••" style={{ width: 120, textAlign: "center", padding: "12px", fontSize: 24, fontWeight: 800, letterSpacing: 8, border: "2px solid var(--bdr)", borderRadius: 12, fontFamily: "'Noto Sans KR'" }} autoFocus />
          </div>
          <button onClick={doCheckIn} disabled={pin.length < 4} style={{ padding: "12px 36px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 800, cursor: pin.length >= 4 ? "pointer" : "default", fontFamily: "'Noto Sans KR'", background: pin.length >= 4 ? "linear-gradient(135deg, var(--ok), #34d399)" : "#e5e7eb", color: pin.length >= 4 ? "#fff" : "var(--tx2)" }}>출석하기</button>
          {msg && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: msg.indexOf("✅") >= 0 ? "var(--ok)" : "var(--pri)" }}>{msg}</div>}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📅 최근 7일 출석 기록</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {history.map(function(h) {
            return (
              <div key={h.date} style={{ flex: "1 1 calc(14.28% - 6px)", minWidth: 40, padding: "8px 4px", textAlign: "center", borderRadius: 8, background: h.present ? "var(--okb)" : h.date === today ? "#fef2f4" : "#f9fafb", border: h.date === today ? "2px solid " + (h.present ? "var(--ok)" : "var(--pri)") : "1px solid var(--bdr)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx2)" }}>{h.day}</div>
                <div style={{ fontSize: 10, color: "var(--tx2)" }}>{h.date.slice(5)}</div>
                <div style={{ fontSize: 16, marginTop: 2 }}>{h.present ? "✅" : h.date === today ? "❌" : "⬜"}</div>
                {h.present && <div style={{ fontSize: 8, color: "var(--ok)" }}>{h.time}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  var [users, setUsers] = useState(INIT_USERS);
  var [textbooks, setTextbooks] = useState(INIT_TB);
  var [curriculum, setCurriculum] = useState(INIT_CUR);
  var [sp, setSp] = useState(INIT_SP);
  var [ohdap, setOhdap] = useState({ active: 0, activeMonth: "", months: {} });
  var [attendance, setAttendance] = useState({});
  var [scores, setScores] = useState({});
  var [selfCodes, setSelfCodes] = useState({});
  var [messages, setMessages] = useState([]);
  var [withdrawals, setWithdrawals] = useState([]);
  var [counsels, setCounsels] = useState([]);
  var [accessLogs, setAccessLogs] = useState([]);
  var [classList, setClassList] = useState(["A반", "B반"]);
  var [cur, setCurState] = useState(function() {
    try { var saved = localStorage.getItem("rt_user"); return saved ? JSON.parse(saved) : null; } catch(e) { return null; }
  });
  var setCur = function(u) {
    setCurState(u);
    try { if (u) localStorage.setItem("rt_user", JSON.stringify(u)); else localStorage.removeItem("rt_user"); } catch(e) {}
  };
  var [parentMode, setParentMode] = useState(false);
  var [parentNotif, setParentNotif] = useState(false);
  var [popupMsg, setPopupMsg] = useState(null);
  var [syncStatus, setSyncStatus] = useState("synced");
  var [dataLoaded, setDataLoaded] = useState(false);
  var [saveVersion, setSaveVersion] = useState(0);
  var saveTimer = useRef(null);
  var justSaved = useRef(false);
  var pendingChanges = useRef(false);
  var dataRef = useRef({ users: INIT_USERS, textbooks: INIT_TB, curriculum: INIT_CUR, sp: INIT_SP, classList: ["A반", "B반"], ohdap: { active: 0, activeMonth: "", months: {} }, attendance: {}, scores: {}, selfCodes: {}, messages: [], withdrawals: [], counsels: [], accessLogs: [] });
  var allA = useMemo(function() { return buildAssignments(textbooks, curriculum); }, [textbooks, curriculum]);

  useEffect(function() { dataRef.current = { users: users, textbooks: textbooks, curriculum: curriculum, sp: sp, classList: classList, ohdap: ohdap, attendance: attendance, scores: scores, selfCodes: selfCodes, messages: messages, withdrawals: withdrawals, counsels: counsels, accessLogs: accessLogs }; }, [users, textbooks, curriculum, sp, classList, ohdap, attendance, scores, selfCodes, messages, withdrawals, counsels, accessLogs]);

  var localSetUsers = useCallback(function(fn) { setUsers(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetTextbooks = useCallback(function(fn) { setTextbooks(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetCurriculum = useCallback(function(fn) { setCurriculum(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetSp = useCallback(function(fn) { setSp(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetClassList = useCallback(function(fn) { setClassList(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetOhdap = useCallback(function(fn) { setOhdap(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetAttendance = useCallback(function(fn) { setAttendance(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetScores = useCallback(function(fn) { setScores(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetSelfCodes = useCallback(function(fn) { setSelfCodes(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetMessages = useCallback(function(fn) { setMessages(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetWithdrawals = useCallback(function(fn) { setWithdrawals(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetCounsels = useCallback(function(fn) { setCounsels(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var localSetAccessLogs = useCallback(function(fn) { setAccessLogs(fn); setSaveVersion(function(v) { return v + 1; }); }, []);
  var sendMessage = useCallback(function(studentId, text) {
    if (!studentId || !text || !text.trim() || !cur) return;
    var msg = { id: "m_" + mkid(), studentId: studentId, fromId: cur.id, fromRole: cur.role, fromName: cur.name, text: text.trim(), ts: Date.now() };
    setMessages(function(prev) { return (prev || []).concat([msg]); });
    setSaveVersion(function(v) { return v + 1; });
    forceSave();
  }, [cur]);

  // 즉시 저장 (삭제 등 중요 작업용 - 디바운스 없음)
  var forceSave = useCallback(function() {
    setTimeout(function() {
      var d = dataRef.current;
      justSaved.current = true;
      pendingChanges.current = true;
      setSyncStatus("saving");
      setDoc(doc(db, "appData", "main"), {
        users: d.users, textbooks: d.textbooks, curriculum: d.curriculum,
        studentProgress: d.sp, classList: d.classList, ohdap: d.ohdap, attendance: d.attendance, scores: d.scores, selfCodes: d.selfCodes, messages: d.messages, withdrawals: d.withdrawals || [], counsels: d.counsels || [], accessLogs: d.accessLogs || [], lastUpdated: new Date().toISOString()
      }).then(function() {
        setSyncStatus("synced");
        pendingChanges.current = false;
      }).catch(function(e) {
        console.error("Force save error:", e);
        setSyncStatus("error");
        justSaved.current = false;
        pendingChanges.current = false;
      });
    }, 100); // 100ms - state 업데이트 반영 대기
  }, []);

  var loginWithLog = function(u) { setCur(u); };
  var accessLogged = useRef(false);


  // 브라우저 자동 번역 방지
  useEffect(function() {
    document.documentElement.lang = "ko";
    document.documentElement.translate = false;
    document.documentElement.setAttribute("translate", "no");
    document.documentElement.classList.add("notranslate");
    document.body.classList.add("notranslate");
    document.body.setAttribute("translate", "no");
    var meta = document.createElement("meta");
    meta.name = "google";
    meta.content = "notranslate";
    document.head.appendChild(meta);
    var metaHttp = document.createElement("meta");
    metaHttp.httpEquiv = "Content-Language";
    metaHttp.content = "ko";
    document.head.appendChild(metaHttp);
  }, []);

  useEffect(function() {
    (async function() {
      try {
        var ref = doc(db, "appData", "main");
        var snap = await getDoc(ref);
        if (snap.exists()) {
          var d = snap.data();
          var loadedUsers = d.users || [];
          // 매니저 계정이 없으면 자동 추가
          if (!loadedUsers.some(function(u) { return u.role === "manager"; })) {
            loadedUsers = loadedUsers.concat([{ id: "mgr1", name: "매니저", role: "manager", password: "1234", avatar: "👔" }]);
          }
          setUsers(loadedUsers);
          if (d.textbooks) setTextbooks(d.textbooks);
          if (d.curriculum) setCurriculum(d.curriculum);
          if (d.studentProgress) setSp(d.studentProgress);
          if (d.classList) setClassList(d.classList);
          if (d.ohdap) { var o = d.ohdap; if (!o.months) { o = { active: Number(o.active) || 0, activeMonth: o.activeMonth || "", months: {} }; } setOhdap(o); }
          if (d.attendance) setAttendance(d.attendance);
          if (d.scores) setScores(d.scores);
          if (d.selfCodes) setSelfCodes(d.selfCodes);
          if (d.messages) setMessages(d.messages);
          if (d.withdrawals) setWithdrawals(d.withdrawals);
          if (d.counsels) setCounsels(d.counsels);
          if (d.accessLogs) setAccessLogs(d.accessLogs);
        } else {
          await setDoc(ref, { users: INIT_USERS, textbooks: INIT_TB, curriculum: INIT_CUR, studentProgress: INIT_SP, classList: ["A반", "B반"], ohdap: { active: 0, activeMonth: "", months: {} } });
        }
        setDataLoaded(true);
        setSyncStatus("synced");
      } catch (e) {
        console.error("Firebase load error:", e);
        setSyncStatus("error");
        setDataLoaded(true);
      }
    })();
  }, []);

  useEffect(function() {
    if (!dataLoaded) return;
    var ref = doc(db, "appData", "main");
    var unsub = onSnapshot(ref, function(snap) {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      if (justSaved.current) { justSaved.current = false; return; }
      if (pendingChanges.current) return;
      var d = snap.data();
      if (d.users) {
        var syncUsers = d.users;
        if (!syncUsers.some(function(u) { return u.role === "manager"; })) {
          syncUsers = syncUsers.concat([{ id: "mgr1", name: "매니저", role: "manager", password: "1234", avatar: "👔" }]);
        }
        setUsers(syncUsers);
      }
      if (d.textbooks) setTextbooks(d.textbooks);
      if (d.curriculum) setCurriculum(d.curriculum);
      if (d.studentProgress) setSp(d.studentProgress);
      if (d.classList) setClassList(d.classList);
      if (d.ohdap) { var o = d.ohdap; if (!o.months) { o = { active: Number(o.active) || 0, activeMonth: o.activeMonth || "", months: {} }; } setOhdap(o); }
          if (d.attendance) setAttendance(d.attendance);
          if (d.scores) setScores(d.scores);
          if (d.selfCodes) setSelfCodes(d.selfCodes);
          if (d.messages) setMessages(d.messages);
          if (d.withdrawals) setWithdrawals(d.withdrawals);
          if (d.counsels) setCounsels(d.counsels);
          if (d.accessLogs) setAccessLogs(d.accessLogs);
    }, function(e) { console.error("Sync error:", e); setSyncStatus("error"); });
    return function() { unsub(); };
  }, [dataLoaded]);

  useEffect(function() {
    if (!dataLoaded || saveVersion === 0) return;
    setSyncStatus("saving");
    pendingChanges.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async function() {
      try {
        var d = dataRef.current;
        justSaved.current = true;
        await setDoc(doc(db, "appData", "main"), {
          users: d.users, textbooks: d.textbooks, curriculum: d.curriculum,
          studentProgress: d.sp, classList: d.classList, ohdap: d.ohdap, attendance: d.attendance, scores: d.scores, selfCodes: d.selfCodes, messages: d.messages, withdrawals: d.withdrawals || [], counsels: d.counsels || [], accessLogs: d.accessLogs || [], lastUpdated: new Date().toISOString()
        });
        setSyncStatus("synced");
        pendingChanges.current = false;
      } catch (e) {
        console.error("Save error:", e);
        setSyncStatus("error");
        justSaved.current = false;
        pendingChanges.current = false;
      }
    }, 1000);
    return function() { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [saveVersion, dataLoaded]);

  // 접속기록: 데이터 로드 후 세션(앱 열 때)마다 1회 기록 — 자동 로그인 포함
  useEffect(function() {
    if (!cur) { accessLogged.current = false; return; }
    if (!dataLoaded) return;
    if (cur.role !== "admin" && cur.role !== "manager" && cur.role !== "instructor") return;
    if (accessLogged.current) return;
    accessLogged.current = true;
    fetchClientIP(function(ip) {
      var rec = { id: "al_" + mkid(), userId: cur.id, userName: cur.name, role: cur.role, time: new Date().toISOString(), ip: ip || "확인불가" };
      setAccessLogs(function(p) {
        var arr = (p || []).concat([rec]);
        if (arr.length > 500) arr = arr.slice(arr.length - 500);
        try { dataRef.current = Object.assign({}, dataRef.current, { accessLogs: arr }); } catch (e) {}
        return arr;
      });
      setSaveVersion(function(v) { return v + 1; });
      if (forceSave) forceSave();
    });
  }, [dataLoaded, cur]);

  // 자가출석 코드 자동 발급 (직원 기기에서만 생성 → 학생은 학원에 와야 코드 확인 가능)
  var codeGenGuard = useRef("");
  useEffect(function() {
    if (!dataLoaded || !cur) return;
    if (cur.role !== "admin" && cur.role !== "manager" && cur.role !== "instructor") return;
    var today = td();
    if (codeGenGuard.current === today) return;
    codeGenGuard.current = today;
    localSetSelfCodes(function(prev) {
      var p = prev || {};
      if (p[today]) return p;
      var next = Object.assign({}, p);
      next[today] = genCode();
      var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      var cutStr = cutoff.toISOString().split("T")[0];
      Object.keys(next).forEach(function(k) { if (k < cutStr) delete next[k]; });
      return next;
    });
  }, [dataLoaded, cur]);

  // Parent notification: request permission and monitor attendance
  var parentLastNotif = useRef("");
  useEffect(function() {
    if (!cur || cur.role !== "parent" || !cur.childId) return;
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(function(p) { setParentNotif(p === "granted"); });
    } else if ("Notification" in window && Notification.permission === "granted") {
      setParentNotif(true);
    }
  }, [cur]);

  useEffect(function() {
    if (!cur || cur.role !== "parent" || !cur.childId || !parentNotif) return;
    var today = td();
    var todayAtt = attendance[today] || {};
    var checkTime = todayAtt[cur.childId];
    if (checkTime && checkTime !== parentLastNotif.current) {
      parentLastNotif.current = checkTime;
      var child = users.find(function(u) { return u.id === cur.childId; });
      var childName = child ? child.name : "자녀";
      try {
        new Notification("📋 ROUTETOP 출석 알림", {
          body: childName + " 학생이 " + checkTime + "에 출석했습니다 ✅",
          tag: "att-" + cur.childId + "-" + today,
          requireInteraction: true
        });
      } catch(e) { console.log("Notif error:", e); }
    }
  }, [cur, attendance, parentNotif, users]);

  // Instructor notification: notify homeroom instructor on student self-attendance
  var instNotifSeen = useRef(null);
  useEffect(function() {
    if (!cur || cur.role !== "instructor") return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [cur]);

  useEffect(function() {
    if (!cur || cur.role !== "instructor") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    var today = td();
    var todayAtt = attendance[today] || {};
    var me = users.find(function(u) { return u.id === cur.id; }) || cur;
    var myClasses = me.assignedClasses || [];
    var myStudents = users.filter(function(u) { return u.role === "student" && myClasses.indexOf(u.classId) >= 0; });
    // Current self-attendance snapshot for my students
    var current = {};
    myStudents.forEach(function(s) {
      var ct = todayAtt[s.id];
      if (ct && ct.indexOf("(자가)") >= 0) current[s.id] = ct;
    });
    // Prime on first run (don't notify for self check-ins that happened before app opened)
    if (instNotifSeen.current === null) { instNotifSeen.current = current; return; }
    // Notify for newly added self check-ins
    myStudents.forEach(function(s) {
      var ct = current[s.id];
      if (ct && instNotifSeen.current[s.id] !== ct) {
        try {
          new Notification("📱 ROUTETOP 자가출석 알림", {
            body: s.name + " 학생(" + s.classId + ")이 " + ct.replace("(자가)", "") + "에 자가출석했습니다",
            tag: "self-" + s.id + "-" + today,
            requireInteraction: true
          });
        } catch(e) { console.log("Notif error:", e); }
      }
    });
    instNotifSeen.current = current;
  }, [cur, attendance, users]);

  // New message popup: alert parent/instructor when an incoming message arrives
  var msgSeen = useRef(null);
  useEffect(function() {
    if (!cur || (cur.role !== "parent" && cur.role !== "instructor")) return;
    var myStudentIds = [];
    if (cur.role === "parent") { if (cur.childId) myStudentIds = [cur.childId]; }
    else {
      var me = users.find(function(u) { return u.id === cur.id; }) || cur;
      var myClasses = me.assignedClasses || [];
      users.forEach(function(u) { if (u.role === "student" && myClasses.indexOf(u.classId) >= 0) myStudentIds.push(u.id); });
    }
    var otherRole = cur.role === "parent" ? "instructor" : "parent";
    var incoming = (messages || []).filter(function(m) { return myStudentIds.indexOf(m.studentId) >= 0 && m.fromRole === otherRole; });
    var latestTs = incoming.reduce(function(mx, m) { return Math.max(mx, m.ts || 0); }, 0);
    if (msgSeen.current === null) { msgSeen.current = latestTs; return; }
    if (latestTs > msgSeen.current) {
      var fresh = incoming.filter(function(m) { return m.ts > msgSeen.current; }).sort(function(a, b) { return a.ts - b.ts; });
      var last = fresh[fresh.length - 1];
      msgSeen.current = latestTs;
      if (last) {
        setPopupMsg(last);
        if ("Notification" in window && Notification.permission === "granted") {
          try { new Notification("💬 ROUTETOP 새 메시지", { body: last.fromName + ": " + last.text, tag: "msg-" + last.id, requireInteraction: true }); } catch(e) { console.log("Notif error:", e); }
        }
      }
    }
  }, [cur, messages, users]);

  // Manager notification: alert when parent messages go unanswered past threshold
  var mgrNotifSeen = useRef({});
  useEffect(function() {
    if (!cur || cur.role !== "manager") return;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }, [cur]);

  useEffect(function() {
    if (!cur || cur.role !== "manager") return;
    var check = function() {
      var pend = pendingReplyThreads(messages).filter(function(p) { return p.waitMin >= MGR_REPLY_THRESHOLD_MIN; });
      var fresh = pend.filter(function(p) { return mgrNotifSeen.current[p.studentId] !== p.last.ts; });
      if (!fresh.length) return;
      fresh.forEach(function(p) { mgrNotifSeen.current[p.studentId] = p.last.ts; });
      var nameOf = function(sid) { var u = users.find(function(x) { return x.id === sid; }); return u ? u.name : "학생"; };
      var names = fresh.map(function(p) { return nameOf(p.studentId); }).join(", ");
      if ("Notification" in window && Notification.permission === "granted") {
        try { new Notification("📢 ROUTETOP 답장 대기", { body: names + " 학부모 메시지에 " + MGR_REPLY_THRESHOLD_MIN + "분 넘게 답장이 없습니다", tag: "mgr-pending", requireInteraction: true }); } catch(e) { console.log("Notif error:", e); }
      }
    };
    check();
    var iv = setInterval(check, 5 * 60 * 1000);
    return function() { clearInterval(iv); };
  }, [cur, messages, users]);
  if (!cur) return (<><style>{CSS}</style><Login users={users} onLogin={loginWithLog} onParent={function() { setParentMode(true); }} /><SyncBadge status={syncStatus} /></>);
  var rl = { admin: "관리자", manager: "매니저", instructor: "강사", student: "학생", parent: "학부모" };
  var sideIcon = cur.role === "admin" ? "🛡️" : cur.role === "manager" ? "👔" : cur.role === "instructor" ? "📊" : cur.role === "parent" ? "👨‍👩‍👧" : "📋";
  var sideLabel = cur.role === "admin" ? "관리 패널" : cur.role === "manager" ? "매니저 패널" : cur.role === "instructor" ? "과제 현황" : cur.role === "parent" ? "학부모" : "전체";
  return (
    <><style>{CSS}</style><div className="app notranslate" translate="no">
      <div className="side notranslate" translate="no"><div className="sbr"><div className="sbr-i">📋</div><span>ROUTETOP</span></div>
        <div className="snav"><button className="si on"><span className="ic">{sideIcon}</span>{sideLabel}</button></div>
        <div className="su"><div className="su-a">{cur.avatar}</div><div style={{ flex: 1 }}><div className="su-n">{cur.name}</div><div className="su-r">{rl[cur.role]}</div></div><button className="lo" onClick={function() { setCur(null); }}>⏻ 로그아웃</button></div></div>
      <div className="main">
        <div className="mob-hd">
          <span style={{ fontSize: 18 }}>{cur.avatar}</span>
          <div className="mob-name">{cur.name}<div className="mob-role">{rl[cur.role]}</div></div>
          <button className="mob-lo" onClick={function() { setCur(null); }}>⏻ 로그아웃</button>
        </div>
        {cur.role === "admin" && <AdminPage users={users} setUsers={localSetUsers} textbooks={textbooks} setTextbooks={localSetTextbooks} curriculum={curriculum} setCurriculum={localSetCurriculum} allA={allA} sp={sp} classList={classList} setClassList={localSetClassList} ohdap={ohdap} setOhdap={localSetOhdap} forceSave={forceSave} attendance={attendance} setAttendance={localSetAttendance} scores={scores} setScores={localSetScores} selfCodes={selfCodes} setSelfCodes={localSetSelfCodes} messages={messages} cur={cur} withdrawals={withdrawals} setWithdrawals={localSetWithdrawals} counsels={counsels} setCounsels={localSetCounsels} accessLogs={accessLogs} setAccessLogs={localSetAccessLogs} />}
        {cur.role === "manager" && <AdminPage users={users} setUsers={localSetUsers} textbooks={textbooks} setTextbooks={localSetTextbooks} curriculum={curriculum} setCurriculum={localSetCurriculum} allA={allA} sp={sp} classList={classList} setClassList={localSetClassList} hideCount={true} ohdap={ohdap} setOhdap={localSetOhdap} forceSave={forceSave} attendance={attendance} setAttendance={localSetAttendance} scores={scores} setScores={localSetScores} selfCodes={selfCodes} setSelfCodes={localSetSelfCodes} messages={messages} cur={cur} withdrawals={withdrawals} setWithdrawals={localSetWithdrawals} counsels={counsels} setCounsels={localSetCounsels} accessLogs={accessLogs} setAccessLogs={localSetAccessLogs} />}
        {cur.role === "instructor" && <InstructorPage user={cur} users={users} allA={allA} sp={sp} selfCodes={selfCodes} messages={messages} onSend={sendMessage} attendance={attendance} scores={scores} classList={classList} forceSave={forceSave} withdrawals={withdrawals} setWithdrawals={localSetWithdrawals} counsels={counsels} setCounsels={localSetCounsels} accessLogs={accessLogs} setAccessLogs={localSetAccessLogs} />}
        {cur.role === "student" && <StudentPage user={cur} allA={allA} sp={sp} setSp={localSetSp} ohdap={ohdap} setOhdap={localSetOhdap} attendance={attendance} setAttendance={localSetAttendance} forceSave={forceSave} selfCodes={selfCodes} />}
        {cur.role === "parent" && <ParentDashboard user={cur} users={users} allA={allA} sp={sp} attendance={attendance} messages={messages} onSend={sendMessage} />}
      </div>
    </div>
    {popupMsg && <div className="mo" onClick={function() { setPopupMsg(null); }} style={{ zIndex: 9999 }}><div className="md" onClick={function(e) { e.stopPropagation(); }} style={{ maxWidth: 360, textAlign: "center" }}>
      <div style={{ fontSize: 38, marginBottom: 6 }}>💬</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{popupMsg.fromName}{popupMsg.fromRole === "instructor" ? " 선생님" : " 학부모님"}</div>
      <div style={{ fontSize: 10, color: "var(--tx2)", marginBottom: 12 }}>새 메시지가 도착했습니다 · {fmtTime(popupMsg.ts)}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, padding: "12px 14px", background: "#f9fafb", borderRadius: 12, marginBottom: 14, whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left" }}>{popupMsg.text}</div>
      <button className="btn btn-p" onClick={function() { setPopupMsg(null); }} style={{ width: "100%" }}>확인</button>
    </div></div>}
    <SyncBadge status={syncStatus} /></>
  );
}

function ParentPage({ users, attendance, onBack }) {
  var [childName, setChildName] = useState("");
  var [child, setChild] = useState(null);
  var [notifEnabled, setNotifEnabled] = useState(false);
  var [lastNotified, setLastNotified] = useState("");
  var students = users.filter(function(u) { return u.role === "student"; });
  var today = td();
  var todayData = attendance[today] || {};

  var findChild = function() {
    var found = students.filter(function(s) { return s.name === childName.trim(); });
    if (found.length === 0) { alert("등록된 학생이 없습니다: " + childName); return; }
    if (found.length === 1) { setChild(found[0]); } else { setChild(found[0]); }
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(function(p) { setNotifEnabled(p === "granted"); });
    } else if ("Notification" in window && Notification.permission === "granted") {
      setNotifEnabled(true);
    }
  };

  // Monitor attendance changes and send notification
  useEffect(function() {
    if (!child || !notifEnabled) return;
    var checkTime = todayData[child.id];
    if (checkTime && checkTime !== lastNotified) {
      setLastNotified(checkTime);
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("📋 ROUTETOP 출석 알림", {
            body: child.name + " 학생이 " + checkTime + "에 출석했습니다 ✅",
            icon: "📋",
            tag: "attendance-" + child.id + "-" + today
          });
        } catch (e) { console.log("Notification error:", e); }
      }
    }
  }, [child, todayData, notifEnabled, lastNotified, today]);

  // History
  var history = [];
  if (child) {
    for (var i = 0; i < 7; i++) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var dateKey = d.toISOString().split("T")[0];
      var dayNames = ["일", "월", "화", "수", "목", "금", "토"];
      var dayAtt = attendance[dateKey] || {};
      history.push({ date: dateKey, day: dayNames[d.getDay()], present: dayAtt[child.id] ? true : false, time: dayAtt[child.id] || "" });
    }
  }

  if (!child) {
    return (
      <div className="login-w"><div className="lb notranslate" translate="no">
        <h1>👨‍👩‍👧 학부모 출석 알림</h1>
        <p className="sub">자녀 이름을 입력하면 출석 알림을 받을 수 있습니다</p>
        <div className="lf"><label>자녀 이름</label><input type="text" placeholder="자녀 이름을 입력하세요" value={childName} onChange={function(e) { setChildName(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") findChild(); }} autoFocus /></div>
        <button className="lbtn" onClick={findChild}>확인</button>
        <div style={{ marginTop: 16, textAlign: "center" }}><button onClick={onBack} style={{ background: "none", border: "none", fontSize: 12, color: "var(--tx2)", cursor: "pointer", textDecoration: "underline", fontFamily: "Noto Sans KR" }}>← 로그인으로 돌아가기</button></div>
      </div></div>
    );
  }

  var isPresent = todayData[child.id] ? true : false;
  var checkTime = todayData[child.id] || "";

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>👨‍👩‍👧 학부모 알림</h2>
        <button className="btn btn-g btn-s" onClick={function() { setChild(null); setChildName(""); }}>← 돌아가기</button>
      </div>

      <div style={{ padding: 20, borderRadius: 16, marginBottom: 16, textAlign: "center", background: isPresent ? "var(--okb)" : "#fef2f4", border: "2px solid " + (isPresent ? "var(--ok)" : "var(--pri)") }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{isPresent ? "✅" : "⏳"}</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{child.name}</div>
        <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 8 }}>{child.classId}</div>
        {isPresent ? (
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ok)" }}>오늘 {checkTime}에 출석했습니다!</div>
        ) : (
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--pri)" }}>아직 출석하지 않았습니다</div>
        )}
      </div>

      <div style={{ padding: 12, borderRadius: 12, marginBottom: 16, background: notifEnabled ? "#eff6ff" : "#fef3c7", border: "1px solid " + (notifEnabled ? "#bfdbfe" : "#fde68a"), fontSize: 12 }}>
        {notifEnabled ? (
          <span>🔔 알림 활성화됨 — 이 페이지를 열어두면 출석 시 알림이 옵니다</span>
        ) : (
          <span>🔕 알림 비활성화 — <button onClick={function() { if ("Notification" in window) { Notification.requestPermission().then(function(p) { setNotifEnabled(p === "granted"); }); } }} style={{ background: "none", border: "none", color: "#2563eb", textDecoration: "underline", cursor: "pointer", fontSize: 12, fontFamily: "Noto Sans KR" }}>알림 허용하기</button></span>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📅 최근 7일 출석 기록</div>
        {history.map(function(h) {
          return (
            <div key={h.date} style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #f3f4f6", gap: 12 }}>
              <div style={{ width: 40, textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 700 }}>{h.day}</div><div style={{ fontSize: 10, color: "var(--tx2)" }}>{h.date.slice(5)}</div></div>
              <div style={{ fontSize: 24 }}>{h.present ? "✅" : h.date === today ? "⏳" : "—"}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: h.present ? "var(--ok)" : "var(--tx2)" }}>{h.present ? h.time + " 출석" : h.date === today ? "대기 중" : "기록 없음"}</div>
            </div>
          );
        })}
      </div>

      <div className="hint" style={{ marginTop: 16 }}>💡 이 페이지를 <strong>홈 화면에 추가</strong>하면 더 편리하게 사용할 수 있습니다. (크롬 메뉴 → "홈 화면에 추가")</div>
    </div>
  );
}

function SyncBadge({ status }) {
  if (status === "error") return <div className="sync-badge error">⚠️ 연결 오류</div>;
  if (status === "saving") return <div className="sync-badge synced" style={{ background: "#fef3c7", color: "#92400e" }}>💾 저장 중...</div>;
  return <div className="sync-badge synced">✅ 저장 완료</div>;
}
