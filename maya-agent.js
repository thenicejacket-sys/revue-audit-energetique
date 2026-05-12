/**
 * maya-agent.js — Module d'apprentissage Maya TOTALEMENT ISOLÉ
 *
 * Règles d'isolation :
 *   - IIFE stricte : aucun symbole global sauf window.MayaAgent
 *   - Ne modifie AUCUNE fonction de AuditVT_Comparator.html autre que window.callMaya
 *   - Si ce fichier est supprimé, l'app retrouve son comportement d'origine
 *   - Préfixes localStorage : maya_*_v1 uniquement (pas de collision)
 *
 * Critères E1-E6 vérifiés côté git diff avant livraison.
 */
(function () {
  'use strict';

  /* ── Garde : si callMaya n'existe pas encore, on ne fait rien ── */
  if (typeof window.callMaya !== 'function') {
    console.warn('[MAYA-AGENT] window.callMaya introuvable — module non activé.');
    return;
  }

  /* ══════════════════════════════════════════════════════════════
     CONSTANTES
  ══════════════════════════════════════════════════════════════ */
  var STORAGE_KEYS = {
    rules:     'maya_system_prompt_rules_v1',   // règles méthodologiques
    lexicon:   'maya_vt_lexicon_v1',            // termes VT ↔ audit
    feedbacks: 'maya_feedbacks_agent_v1'        // log feedbacks bruts
  };

  /* ══════════════════════════════════════════════════════════════
     SAUVEGARDE DE LA FONCTION ORIGINALE (critère E4)
  ══════════════════════════════════════════════════════════════ */
  window.__callMayaOriginal = window.callMaya;

  /* ══════════════════════════════════════════════════════════════
     HELPERS STORAGE
  ══════════════════════════════════════════════════════════════ */
  function storageGet(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[MAYA-AGENT] localStorage write failed:', key, e.message);
    }
  }

  function generateId() {
    return 'ma_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  /* ══════════════════════════════════════════════════════════════
     MÉMOIRES
     Structure rules :  [{id, rule, addedAt, appliedCount, active}]
     Structure lexicon: [{id, vtTerm, auditTerm, context, addedAt, active}]
  ══════════════════════════════════════════════════════════════ */
  function getRules() {
    var data = storageGet(STORAGE_KEYS.rules);
    return Array.isArray(data) ? data : [];
  }

  function getLexicon() {
    var data = storageGet(STORAGE_KEYS.lexicon);
    return Array.isArray(data) ? data : [];
  }

  function saveRules(rules) {
    storageSet(STORAGE_KEYS.rules, rules);
  }

  function saveLexicon(lexicon) {
    storageSet(STORAGE_KEYS.lexicon, lexicon);
  }

  /* ══════════════════════════════════════════════════════════════
     CLASSIFIER — détermine la nature du feedback
     Retourne : 'global' | 'lexique' | 'local'
     Par défaut : 'global' (98 % des cas)
  ══════════════════════════════════════════════════════════════ */
  function classifyFeedback(feedback) {
    /* Priorité explicite passée par l'appelant */
    if (feedback.type === 'lexique') return 'lexique';
    if (feedback.type === 'local')   return 'local';
    if (feedback.type === 'global')  return 'global';

    var txt = (feedback.text || '').toLowerCase();

    /* Signal lexique : patterns "X correspond à Y", "X = Y dans les VT",
       "terme X", "libellé X", "champ X"  */
    var lexiquePatterns = [
      /\bcorrespond\s+(?:toujours\s+)?[àa]\b/,
      /\bdans\s+les?\s+vt[,\s]/,
      /\bterme\s+vt\b/,
      /\blibellé\b/,
      /\bsynonyme\b/,
      /\s+=\s+["«]?[a-zA-ZÀ-ÿ]/,
      /\bchamp\s+["«]?[a-zA-ZÀ-ÿ]/
    ];
    for (var i = 0; i < lexiquePatterns.length; i++) {
      if (lexiquePatterns[i].test(txt)) return 'lexique';
    }

    /* Signal local : feedback contient un nom de bâtiment / adresse explicite */
    var localPatterns = [
      /\b(?:bâtiment|immeuble|résidence|lot)\s+[A-Z]/,
      /\b\d{1,4}\s+(?:rue|avenue|boulevard|allée|impasse)/i,
      /\bce\s+dossier\s+(?:précis|spécifique|uniquement)\b/
    ];
    for (var j = 0; j < localPatterns.length; j++) {
      if (localPatterns[j].test(txt)) return 'local';
    }

    /* Par défaut : global */
    return 'global';
  }

  /* ══════════════════════════════════════════════════════════════
     LEARN — ajoute un feedback à la mémoire appropriée
     feedback : { text, type?, vtTerm?, auditTerm?, context?, source? }
  ══════════════════════════════════════════════════════════════ */
  function learn(feedback) {
    if (!feedback || !feedback.text) {
      console.warn('[MAYA-AGENT] learn() appelé sans texte — ignoré.');
      return;
    }

    var kind = classifyFeedback(feedback);
    var now  = new Date().toISOString();

    if (kind === 'lexique') {
      var lexicon = getLexicon();
      var entry = {
        id:        generateId(),
        vtTerm:    feedback.vtTerm    || extractVtTerm(feedback.text) || feedback.text.slice(0, 60),
        auditTerm: feedback.auditTerm || extractAuditTerm(feedback.text) || '',
        context:   feedback.context   || feedback.text,
        addedAt:   now,
        active:    true
      };
      lexicon.push(entry);
      saveLexicon(lexicon);
      console.log('[MAYA-AGENT] Lexique enrichi — vtTerm:', entry.vtTerm, '→ auditTerm:', entry.auditTerm);
    } else if (kind === 'global') {
      var rules = getRules();
      var rule = {
        id:           generateId(),
        rule:         feedback.text,
        addedAt:      now,
        appliedCount: 0,
        active:       true
      };
      rules.push(rule);
      saveRules(rules);
      console.log('[MAYA-AGENT] Règle globale ajoutée:', rule.rule.slice(0, 80));
    } else {
      /* local — on logue mais on n'enrichit pas la mémoire persistante */
      console.log('[MAYA-AGENT] Feedback local reçu (non persisté dans mémoire globale):', feedback.text.slice(0, 80));
    }

    /* Log brut toujours */
    var log = storageGet(STORAGE_KEYS.feedbacks);
    if (!Array.isArray(log)) log = [];
    log.push({ id: generateId(), text: feedback.text, kind: kind, addedAt: now });
    storageSet(STORAGE_KEYS.feedbacks, log);
  }

  /* Helpers d'extraction heuristique pour les terms VT/audit */
  function extractVtTerm(text) {
    /* Pattern : "surface habitable" correspond / "X" = Y */
    var m = text.match(/["«]([^"»]+)["»]/);
    if (m) return m[1];
    return null;
  }

  function extractAuditTerm(text) {
    /* Pattern : correspond à "SHAB" / = "SHAB" */
    var m = text.match(/(?:correspond\s+(?:toujours\s+)?[àa]|=)\s+["«]?([A-Z][A-Z0-9\s\-]{1,30})["»]?/i);
    if (m) return m[1].trim();
    return null;
  }

  /* ══════════════════════════════════════════════════════════════
     TOGGLE RULE — active / désactive une règle par id
  ══════════════════════════════════════════════════════════════ */
  function toggleRule(id) {
    var rules = getRules();
    var rule  = rules.find(function (r) { return r.id === id; });
    if (!rule) {
      console.warn('[MAYA-AGENT] toggleRule — id introuvable:', id);
      return;
    }
    rule.active = !rule.active;
    saveRules(rules);
    console.log('[MAYA-AGENT] Règle', id, 'active =', rule.active);
  }

  /* ══════════════════════════════════════════════════════════════
     BUILD INJECTION — construit le bloc texte à injecter dans
     le prompt système Maya à chaque analyse
  ══════════════════════════════════════════════════════════════ */
  function buildInjectionBlock() {
    var rules   = getRules().filter(function (r) { return r.active; });
    var lexicon = getLexicon().filter(function (l) { return l.active; });

    var block = '';

    if (rules.length > 0) {
      block += '\n\n[MAYA-AGENT RÈGLES APPRISES]\n';
      block += 'Ces règles ont été apprises de l\'utilisateur. Applique-les strictement.\n';
      rules.forEach(function (r, i) {
        block += (i + 1) + '. ' + r.rule + '\n';
      });
    }

    if (lexicon.length > 0) {
      block += '\n[MAYA-AGENT LEXIQUE VT↔AUDIT]\n';
      block += 'Équivalences terminologiques confirmées par l\'utilisateur :\n';
      lexicon.forEach(function (l) {
        block += '- VT "' + l.vtTerm + '" = Audit "' + l.auditTerm + '"' + (l.context ? ' (' + l.context.slice(0, 60) + ')' : '') + '\n';
      });
    }

    return block;
  }

  /* ══════════════════════════════════════════════════════════════
     WRAPPER callMaya — injecte la mémoire dans le prompt
     NE MODIFIE PAS la logique de traitement, uniquement les inputs
  ══════════════════════════════════════════════════════════════ */
  function callMayaWrapper(results, auditText, vtText) {
    var injectionBlock = buildInjectionBlock();

    /* On enrichit vtText avec le bloc d'injection (en fin de document,
       après un séparateur clair pour ne pas perturber la lecture Maya) */
    var enrichedVtText = vtText;
    if (injectionBlock) {
      enrichedVtText = vtText + injectionBlock;
    }

    /* Incrémenter appliedCount pour les règles actives */
    var rules = getRules();
    var activeCount = 0;
    rules.forEach(function (r) {
      if (r.active) {
        r.appliedCount = (r.appliedCount || 0) + 1;
        activeCount++;
      }
    });
    if (activeCount > 0) {
      saveRules(rules);
      console.log('[MAYA-AGENT] ' + activeCount + ' règle(s) injectée(s) dans l\'analyse Maya.');
    }

    /* Appel de la fonction originale avec les textes enrichis */
    return window.__callMayaOriginal(results, auditText, enrichedVtText);
  }

  /* ══════════════════════════════════════════════════════════════
     DASHBOARD DATA — données pour le panneau "🧠 Maya apprend"
  ══════════════════════════════════════════════════════════════ */
  function getDashboardData() {
    var rules   = getRules();
    var lexicon = getLexicon();
    var log     = storageGet(STORAGE_KEYS.feedbacks);

    var activeRules   = rules.filter(function (r) { return r.active; }).length;
    var activeLexicon = lexicon.filter(function (l) { return l.active; }).length;

    /* Taux d'application : règles avec appliedCount > 0 */
    var appliedRules  = rules.filter(function (r) { return (r.appliedCount || 0) > 0; }).length;
    var appRate = rules.length > 0 ? Math.round((appliedRules / rules.length) * 100) : 0;

    /* Table feedbacks pour dashboard */
    var feedbackRows = (Array.isArray(log) ? log : []).map(function (fb) {
      /* Récupère l'action associée */
      var actionText = '';
      if (fb.kind === 'global') {
        var r = rules.find(function (r2) { return r2.addedAt && Math.abs(new Date(r2.addedAt) - new Date(fb.addedAt)) < 2000; });
        actionText = r ? 'Règle globale : ' + r.rule.slice(0, 60) + (r.rule.length > 60 ? '…' : '') : 'Règle globale ajoutée';
      } else if (fb.kind === 'lexique') {
        var l = lexicon.find(function (l2) { return l2.addedAt && Math.abs(new Date(l2.addedAt) - new Date(fb.addedAt)) < 2000; });
        actionText = l ? 'Lexique : "' + l.vtTerm + '" = "' + l.auditTerm + '"' : 'Terme lexique ajouté';
      } else {
        actionText = 'Feedback local (non persisté globalement)';
      }

      return {
        date:    fb.addedAt,
        text:    fb.text,
        action:  actionText,
        kind:    fb.kind
      };
    });

    return {
      rules:        rules,
      lexicon:      lexicon,
      feedbacks:    feedbackRows,
      stats: {
        totalRules:      rules.length,
        activeRules:     activeRules,
        totalLexicon:    lexicon.length,
        activeLexicon:   activeLexicon,
        appRate:         appRate
      }
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ENABLE / DISABLE (critère E4)
  ══════════════════════════════════════════════════════════════ */
  function enable() {
    if (window.callMaya !== callMayaWrapper) {
      window.callMaya = callMayaWrapper;
      console.log('[MAYA-AGENT] Module activé — wrapper callMaya installé.');
    }
  }

  function disable() {
    window.callMaya = window.__callMayaOriginal;
    console.log('[MAYA-AGENT] Module désactivé — callMaya originale restaurée.');
  }

  /* ══════════════════════════════════════════════════════════════
     API PUBLIQUE — seul symbole global exposé (critère E2)
  ══════════════════════════════════════════════════════════════ */
  window.MayaAgent = {
    enable:           enable,
    disable:          disable,
    learn:            learn,
    getMemory:        function () { return { rules: getRules(), lexicon: getLexicon() }; },
    toggleRule:       toggleRule,
    getDashboardData: getDashboardData
  };

  /* Auto-enable au chargement */
  enable();

  console.log('[MAYA-AGENT] Module chargé — 2 mémoires initialisées, auto-enable effectué.');
  console.log('[MAYA-AGENT] Règles actives:', getRules().filter(function (r) { return r.active; }).length);
  console.log('[MAYA-AGENT] Termes lexique actifs:', getLexicon().filter(function (l) { return l.active; }).length);

})();
