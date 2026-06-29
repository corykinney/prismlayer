(function () {
  "use strict";

  // The geometric series has three degrees of freedom (t1, r, n). "Size" is a
  // fourth logical parameter expressed two interchangeable ways: total
  // thickness (T) or near-core layer thickness (t_n). The user edits
  // whichever they know; the other is derived.
  const FIELDS = ["first", "ratio", "count", "total", "last"];
  const els = {};
  FIELDS.forEach(k => els[k] = document.getElementById(k));
  const statusEl = document.getElementById("status");
  const layersEl = document.getElementById("layers");
  const layersEmptyEl = document.getElementById("layersEmpty");
  const thU = document.getElementById("thU");
  const distU = document.getElementById("distU");

  // length fields each carry their own unit picker; values are converted to a
  // common base (metres) for the math and back for display
  const LEN_FIELDS = ["first", "total", "last"];
  const UNIT_M = { m: 1, mm: 0.001 };           // metres per unit
  const unitSel = {};
  const unitPrev = {};
  LEN_FIELDS.forEach(k => {
    unitSel[k] = document.getElementById("unit-" + k);
    unitPrev[k] = unitSel[k].value;
  });

  // which logical parameter is computed: "first" | "ratio" | "count" | "size"
  let solveFor = "count";
  // when size is an input, which representation the user edited most recently
  let sizeInput = "total";

  const LABELS = {
    first: "Near-wall thickness",
    ratio: "Stretch factor",
    count: "Number of layers",
    total: "Total thickness",
    last: "Near-core layer thickness"
  };

  // ---- unit helpers --------------------------------------------------------

  function lenFactor(k) { return UNIT_M[unitSel[k].value]; }    // metres per displayed unit
  function unitName(k) { return unitSel[k].value; }
  function isLenOutput(k) {
    if (k === "first") return solveFor === "first";
    return solveFor === "size";                                 // total or last
  }

  // ---- core math (operates in base metres / dimensionless) -----------------

  function totalFrom(t1, r, n) {
    if (Math.abs(r - 1) < 1e-12) return t1 * n;        // uniform layers
    return t1 * (Math.pow(r, n) - 1) / (r - 1);
  }
  function lastFrom(t1, r, n) { return t1 * Math.pow(r, n - 1); }

  function firstFromTotal(r, n, T) {
    if (Math.abs(r - 1) < 1e-12) return T / n;
    return T * (r - 1) / (Math.pow(r, n) - 1);
  }
  function countFromTotal(t1, r, T) {
    if (Math.abs(r - 1) < 1e-12) return T / t1;
    const x = 1 + T * (r - 1) / t1;                    // r^n
    if (x <= 0) return NaN;
    return Math.log(x) / Math.log(r);
  }
  // Solve stretch factor numerically: totalFrom(t1, r, n) = T (monotonic in r).
  function ratioFromTotal(t1, n, T) {
    if (n <= 1) return NaN;
    const uniform = t1 * n;                            // total when r = 1
    const tol = 1e-12;
    const f = r => totalFrom(t1, r, n) - T;            // increasing in r

    if (Math.abs(T - uniform) < uniform * 1e-9) return 1;

    let lo, hi;
    if (T > uniform) {        // need r > 1 (growing layers)
      lo = 1; hi = 2;
      let guard = 0;
      while (f(hi) < 0 && guard++ < 200) hi *= 1.5;
      if (f(hi) < 0) return NaN;
    } else {                  // need r < 1 (shrinking layers)
      lo = 1e-9; hi = 1;
      if (f(lo) > 0) return NaN;
    }
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      const v = f(mid);
      if (Math.abs(v) < tol * Math.max(1, T)) return mid;
      if (v < 0) lo = mid; else hi = mid;
      if (hi - lo < tol) break;
    }
    return 0.5 * (lo + hi);
  }

  function firstFromLast(r, n, tL) { return tL / Math.pow(r, n - 1); }
  function ratioFromLast(t1, n, tL) {
    if (n <= 1) return NaN;
    const x = tL / t1;
    if (x <= 0) return NaN;
    return Math.pow(x, 1 / (n - 1));
  }
  function countFromLast(t1, r, tL) {
    if (Math.abs(r - 1) < 1e-12) return NaN;
    const x = tL / t1;
    if (x <= 0) return NaN;
    return 1 + Math.log(x) / Math.log(r);
  }

  // ---- input helpers -------------------------------------------------------

  function readVal(key) {
    const raw = els[key].value.trim();
    if (raw === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : NaN;
  }

  // Read a length field in base metres (null/NaN preserved).
  function readBase(key) {
    const v = readVal(key);
    if (v === null || Number.isNaN(v)) return v;
    return v * lenFactor(key);
  }

  // The active size value (in base metres): the last-edited representation,
  // falling back to the other if the preferred one is empty.
  function readSizeSource() {
    // While the user is actively editing a size field, treat it as
    // authoritative and do NOT fall back to its sibling — otherwise a
    // half-typed value like "2e" (momentarily invalid, so .value is "") would
    // be replaced by a value computed from the other field.
    const focused = document.activeElement;
    const editing = focused === els.total || focused === els.last;
    const order = editing
      ? (focused === els.last ? ["last", "total"] : ["total", "last"])
      : (sizeInput === "last" ? ["last", "total"] : ["total", "last"]);

    for (const k of order) {
      const raw = readVal(k);
      if (raw !== null) return { key: k, val: Number.isNaN(raw) ? raw : raw * lenFactor(k) };
      if (editing) return null;   // focused field empty/half-typed → don't fall back
    }
    return null;
  }

  function fmt(v) {
    if (!Number.isFinite(v)) return "";
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e6 || a < 1e-3) return v.toExponential(4);
    return parseFloat(v.toPrecision(6)).toString();
  }

  // ---- domain validation ---------------------------------------------------

  function domainCommon(p) {
    if (p.first != null && p.first <= 0) return "Near-wall thickness must be greater than 0.";
    if (p.ratio != null && p.ratio <= 0) return "Stretch factor must be greater than 0.";
    if (p.count != null && p.count < 1) return "Number of layers must be at least 1.";
    if (p.count != null && Math.abs(p.count - Math.round(p.count)) > 1e-9)
      return "Number of layers must be a whole number.";
    return null;
  }

  // ---- main recompute ------------------------------------------------------

  function recompute() {
    if (solveFor === "size") computeSize();
    else computeParam();
  }

  // Compute total and near-core layer thickness from t1, r, n.
  function computeSize() {
    els.total.value = "";
    els.last.value = "";
    const t1 = readBase("first"), r = readVal("ratio"), n = readVal("count");
    if (t1 === null || r === null || n === null ||
        Number.isNaN(t1) || Number.isNaN(r) || Number.isNaN(n)) {
      setStatus("Enter near-wall thickness, stretch factor and layer count to compute the mesh size.", "");
      renderLayers(null);
      return;
    }
    const e = domainCommon({ first: t1, ratio: r, count: n });
    if (e) { setStatus(e, "error"); renderLayers(null); return; }

    const T = totalFrom(t1, r, n), tL = lastFrom(t1, r, n);
    els.total.value = fmt(T / lenFactor("total"));
    els.last.value = fmt(tL / lenFactor("last"));
    setStatus("Total thickness = " + fmt(T / lenFactor("total")) + " " + unitName("total") +
              ", near-core layer = " + fmt(tL / lenFactor("last")) + " " + unitName("last") + ".", "ok");
    renderLayers({ first: t1, ratio: r, count: n });
  }

  // Compute first / ratio / count from the other two and the active size value.
  function computeParam() {
    els[solveFor].value = "";
    const baseKeys = ["first", "ratio", "count"].filter(k => k !== solveFor);
    const base = {};
    let missing = false, bad = false;
    baseKeys.forEach(k => {
      const v = (k === "first") ? readBase(k) : readVal(k);
      base[k] = v;
      if (v === null) missing = true; else if (Number.isNaN(v)) bad = true;
    });
    const src = readSizeSource();
    if (src === null) missing = true; else if (Number.isNaN(src.val)) bad = true;

    if (missing || bad) {
      setStatus("Enter the three input values to compute " + LABELS[solveFor].toLowerCase() + ".", "");
      renderLayers(null);
      return;
    }

    let e = domainCommon(base);
    if (!e && src.val <= 0) e = "Thickness must be greater than 0.";
    if (e) { setStatus(e, "error"); renderLayers(null); return; }

    const usingLast = src.key === "last";
    // The defining triple we will display / chart, in base metres.
    let p = { first: base.first, ratio: base.ratio, count: base.count };
    let result;          // value shown in the solved field
    let actualRatio;     // for count mode: the true stretch factor after rounding

    if (solveFor === "first") {
      result = usingLast ? firstFromLast(base.ratio, base.count, src.val)
                         : firstFromTotal(base.ratio, base.count, src.val);
      p.first = result;
    } else if (solveFor === "ratio") {
      result = usingLast ? ratioFromLast(base.first, base.count, src.val)
                         : ratioFromTotal(base.first, base.count, src.val);
      p.ratio = result;
    } else { // count — stretch factor is a MAX bound; round layers up, then
             // back out the actual (smaller) stretch factor for that integer n
      const rMax = base.ratio;
      const nExact = usingLast ? countFromLast(base.first, rMax, src.val)
                               : countFromTotal(base.first, rMax, src.val);
      if (Number.isFinite(nExact) && nExact > 0) {
        const rounded = Math.round(nExact);
        let n = (Math.abs(nExact - rounded) < 1e-6) ? rounded : Math.ceil(nExact);
        n = Math.max(1, n);
        result = n;
        p.count = n;
        if (n <= 1) {
          actualRatio = rMax;                 // single layer: stretch is irrelevant
        } else {
          const ra = usingLast ? ratioFromLast(base.first, n, src.val)
                               : ratioFromTotal(base.first, n, src.val);
          actualRatio = (Number.isFinite(ra) && ra > 0) ? ra : rMax;
        }
        p.ratio = actualRatio;
      } else {
        result = NaN;
      }
    }

    const invalid = !Number.isFinite(result) || result <= 0 ||
                    (solveFor === "count" && result < 1);
    if (invalid) {
      setStatus("No valid solution for these inputs. Check that the values are physically consistent.", "error");
      renderLayers(null);
      return;
    }

    // "first" is a length → display in its own unit; ratio/count are unitless.
    els[solveFor].value = (solveFor === "first") ? fmt(result / lenFactor("first")) : fmt(result);

    // Fill the derived size value from the consistent triple.
    if (src.key === "total") els.last.value = fmt(lastFrom(p.first, p.ratio, p.count) / lenFactor("last"));
    else els.total.value = fmt(totalFrom(p.first, p.ratio, p.count) / lenFactor("total"));

    if (solveFor === "count") {
      setStatus("Number of layers = " + result + " — actual stretch factor " + fmt(actualRatio) +
                "× (≤ " + fmt(base.ratio) + "× max).", "ok");
    } else {
      let dispResult, unit = "";
      if (solveFor === "first") { dispResult = result / lenFactor("first"); unit = " " + unitName("first"); }
      else { dispResult = result; unit = "×"; }   // ratio
      setStatus(LABELS[solveFor] + " = " + fmt(dispResult) + unit + ".", "ok");
    }
    renderLayers(p);
  }

  // ---- presentation --------------------------------------------------------

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function renderLayers(p) {
    layersEl.innerHTML = "";
    if (!p) { showEmpty("Enter valid inputs to see the layer-by-layer breakdown."); return; }
    const n = Math.round(p.count);
    if (n < 1) { showEmpty("Need at least one layer to show a breakdown."); return; }
    if (n > 1000) { showEmpty("Too many layers (" + n + ") to list — reduce the count to view the breakdown."); return; }

    // Breakdown is shown in the near-wall thickness unit.
    const f = lenFactor("first");
    const u = " (" + unitName("first") + ")";
    thU.textContent = u;
    distU.textContent = u;

    // Build from the wall outward: layer 1 = near-wall (index 0). "Wall
    // distance" is the cumulative height from the wall to that layer's outer
    // edge, so layer n's wall distance equals the total thickness.
    const rows = [];
    let cum = 0;
    for (let i = 0; i < n; i++) {
      const t = p.first * Math.pow(p.ratio, i);
      cum += t;
      rows.push({ layer: i + 1, t: t, dist: cum });
    }

    // Display near-core layer first, near-wall layer last.
    const frag = document.createDocumentFragment();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + r.layer + "</td><td>" + fmt(r.t / f) + "</td><td>" + fmt(r.dist / f) + "</td>";
      frag.appendChild(tr);
    }
    layersEl.appendChild(frag);
    layersEmptyEl.style.display = "none";
  }

  function showEmpty(msg) {
    layersEl.innerHTML = "";
    layersEmptyEl.textContent = msg;
    layersEmptyEl.style.display = "block";
  }

  // ---- solve-target selection ----------------------------------------------

  function setSolveFor(param) {
    solveFor = param;
    // Highlight the solved block. The size group (data-key="size") covers both
    // total and near-core layer thickness.
    document.querySelectorAll(".field[data-key]").forEach(field => {
      field.classList.toggle("solved", field.dataset.key === param);
    });
    els.first.readOnly = param === "first";
    els.ratio.readOnly = param === "ratio";
    els.count.readOnly = param === "count";
    els.total.readOnly = param === "size";
    els.last.readOnly = param === "size";
    // When solving for layer count the stretch factor is treated as an upper
    // bound — flag the field so the "≤" indicator shows.
    document.querySelector('.field[data-key="ratio"]').classList.toggle("max-bound", param === "count");
    // Steppers only make sense when the layer count is an editable input.
    document.querySelectorAll(".step").forEach(b => b.disabled = (param === "count"));
    recompute();
  }

  // Step the layer count, clamped to a minimum of 1. If the current value is
  // not a whole number (e.g. a computed 15.3 carried over from solving for it),
  // snap to the nearest integer in the step direction: − → 15, + → 16.
  function stepCount(delta) {
    if (solveFor === "count") return;
    const cur = parseFloat(els.count.value);
    let next;
    if (!Number.isFinite(cur)) {
      next = 1;
    } else if (Math.abs(cur - Math.round(cur)) < 1e-9) {
      next = Math.round(cur) + delta;
    } else {
      next = delta > 0 ? Math.ceil(cur) : Math.floor(cur);
    }
    els.count.value = Math.max(1, next);
    recompute();
  }

  // ---- wiring --------------------------------------------------------------

  document.querySelectorAll(".solve-toggle").forEach(btn => {
    btn.addEventListener("click", () => setSolveFor(btn.dataset.solve));
  });
  document.querySelectorAll(".step").forEach(btn => {
    btn.addEventListener("click", () => stepCount(Number(btn.dataset.step)));
  });
  ["first", "ratio"].forEach(k => els[k].addEventListener("input", recompute));

  // Layer count is a positive integer — block decimal/exponent/sign keystrokes
  // and normalise anything pasted in to a whole number.
  els.count.addEventListener("keydown", e => {
    if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault();
  });
  els.count.addEventListener("input", () => {
    const raw = els.count.value;
    if (raw !== "") {
      const n = Math.trunc(Math.abs(Number(raw)));
      const norm = Number.isFinite(n) ? String(n) : "";
      if (norm !== raw) els.count.value = norm;
    }
    recompute();
  });

  // editing either size field makes it the active input (last edited wins)
  els.total.addEventListener("input", () => { sizeInput = "total"; recompute(); });
  els.last.addEventListener("input", () => { sizeInput = "last"; recompute(); });

  // Changing a unit converts an editable value so the physical quantity is
  // preserved; computed fields are simply re-rendered in the new unit.
  LEN_FIELDS.forEach(k => {
    unitSel[k].addEventListener("change", () => {
      const newU = unitSel[k].value, oldU = unitPrev[k];
      unitPrev[k] = newU;
      if (!isLenOutput(k)) {
        const v = parseFloat(els[k].value);
        if (Number.isFinite(v)) els[k].value = fmt(v * UNIT_M[oldU] / UNIT_M[newU]);
      }
      recompute();
    });
  });

  document.getElementById("reset").addEventListener("click", () => {
    FIELDS.forEach(k => els[k].value = "");
    sizeInput = "total";
    setSolveFor("count");
  });

  // ---- init with a sensible example ----------------------------------------
  els.first.value = "0.001";
  els.ratio.value = "1.2";
  els.total.value = "0.05";
  sizeInput = "total";
  setSolveFor("count");
})();
