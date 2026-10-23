import { useState } from 'react';

/**
 * The vendor screen in English or Hindi. Many technicians read Hindi more
 * easily; the choice is remembered on their phone. Messages from the server
 * (error reasons, the timeline) stay as they are.
 */

export type Lang = 'en' | 'hi';

const en = {
  loading: 'Loading your jobs…',
  loadFailed: 'Your jobs could not be loaded.',
  jobsDone: 'jobs done',
  onDuty: 'On duty',
  offDuty: 'Off duty',
  offDutyHint: 'You are off duty: new jobs go to other vendors first. Go on duty to get work.',
  jobsToDo: (n: number) => `${n} job${n > 1 ? 's' : ''} to do, in this order.`,
  noJobs: 'No jobs right now. New ones appear here as residents report them.',
  movedToYou: (n: number) => ` ${n} waiting job${n > 1 ? 's' : ''} moved to you.`,
  doneThisWeek: 'Done this week',
  next: 'Next',
  inLine: (n: number | string) => `#${n} in line`,
  reopened: 'Reopened',
  urgent: 'Urgent',
  urgency: { High: 'High', Medium: 'Medium', Low: 'Low' } as Record<string, string>,
  stage: {
    new: 'New',
    accepted: 'Accepted',
    on_the_way: 'On the way',
    started: 'Working',
    waiting_parts: 'Waiting for parts',
  } as Record<string, string>,
  expectedIn: (eta: string) => `expected in ${eta}`,
  acceptWithin: (min: number) => `Accept within ${min} min`,
  acceptNow: 'Accept now, or it goes to another vendor',
  resident: 'Resident',
  call: 'Call',
  photoFromResident: 'Photo from the resident',
  buttons: {
    accept: 'Accept',
    on_my_way: 'On my way',
    start: 'Start work',
    need_parts: 'Need parts',
    complete: 'Completed',
    decline: 'Decline',
  } as Record<string, string>,
  cantTake: 'Can’t take this job',
  forms: {
    need_parts: { label: 'Which parts do you need?', placeholder: 'e.g. Half-inch washer, PVC elbow', submit: 'Save' },
    complete: {
      label: 'What did you do?',
      placeholder: 'e.g. Replaced the washer, no more leak',
      submit: 'Mark completed',
    },
    decline: {
      label: 'Why can’t you take it?',
      placeholder: 'e.g. No parts for this geyser model',
      submit: 'Decline job',
    },
  } as Record<string, { label: string; placeholder: string; submit: string }>,
  afterPhoto: 'Photo of the finished work',
  addPhoto: 'Add photo',
  uploading: 'Uploading…',
  saving: 'Saving…',
  back: 'Back',
  history: 'History',
  offline: 'No connection. Steps you take are saved and sent when you are back online.',
  queued: (n: number) => `${n} step${n > 1 ? 's' : ''} waiting to send`,
  queuedFailed: (job: string, why: string) => `Could not send a step for #${job}: ${why}`,
  photoNeedsConnection: 'Adding a photo needs a connection. Try again when you are online.',
  planned: 'Planned visit',
  checklist: (done: number, total: number) => `Checklist: ${done} of ${total} done`,
  checklistFirst: 'Tick every check before marking the job done.',
  savedOffline: 'Saved. It will be sent when you are back online.',
  language: 'हिंदी',
};

type Strings = typeof en;

const hi: Strings = {
  loading: 'आपके काम लोड हो रहे हैं…',
  loadFailed: 'आपके काम लोड नहीं हो पाए।',
  jobsDone: 'काम पूरे',
  onDuty: 'ड्यूटी पर',
  offDuty: 'ड्यूटी से बाहर',
  offDutyHint: 'आप ड्यूटी पर नहीं हैं: नए काम पहले दूसरे वेंडर को जाएंगे। काम पाने के लिए ड्यूटी पर आएं।',
  jobsToDo: (n) => `${n} काम करने हैं, इसी क्रम में।`,
  noJobs: 'अभी कोई काम नहीं है। निवासी शिकायत करेंगे तो नए काम यहां दिखेंगे।',
  movedToYou: (n) => ` ${n} इंतज़ार कर रहे काम आपको दिए गए।`,
  doneThisWeek: 'इस हफ्ते पूरे हुए',
  next: 'अगला',
  inLine: (n) => `लाइन में #${n}`,
  reopened: 'दोबारा खुला',
  urgent: 'ज़रूरी',
  urgency: { High: 'ज़्यादा', Medium: 'मध्यम', Low: 'कम' },
  stage: {
    new: 'नया',
    accepted: 'स्वीकार किया',
    on_the_way: 'रास्ते में',
    started: 'काम चालू',
    waiting_parts: 'पार्ट्स का इंतज़ार',
  },
  expectedIn: (eta) => `${eta} में पहुंचना है`,
  acceptWithin: (min) => `${min} मिनट में स्वीकार करें`,
  acceptNow: 'अभी स्वीकार करें, वरना काम दूसरे वेंडर को जाएगा',
  resident: 'निवासी',
  call: 'कॉल करें',
  photoFromResident: 'निवासी की फ़ोटो',
  buttons: {
    accept: 'स्वीकार करें',
    on_my_way: 'रास्ते में हूं',
    start: 'काम शुरू करें',
    need_parts: 'पार्ट्स चाहिए',
    complete: 'काम पूरा',
    decline: 'मना करें',
  },
  cantTake: 'यह काम नहीं ले सकता',
  forms: {
    need_parts: { label: 'कौन से पार्ट्स चाहिए?', placeholder: 'जैसे: आधा इंच वॉशर, PVC एल्बो', submit: 'सेव करें' },
    complete: { label: 'आपने क्या काम किया?', placeholder: 'जैसे: वॉशर बदला, अब लीक नहीं', submit: 'काम पूरा करें' },
    decline: {
      label: 'आप यह काम क्यों नहीं ले सकते?',
      placeholder: 'जैसे: इस गीज़र का पार्ट नहीं है',
      submit: 'मना करें',
    },
  },
  afterPhoto: 'पूरे काम की फ़ोटो',
  addPhoto: 'फ़ोटो जोड़ें',
  uploading: 'अपलोड हो रहा है…',
  saving: 'सेव हो रहा है…',
  back: 'वापस',
  history: 'इतिहास',
  offline: 'इंटरनेट नहीं है। आपके कदम सेव रहेंगे और इंटरनेट आने पर भेजे जाएंगे।',
  queued: (n) => `${n} कदम भेजने बाकी हैं`,
  queuedFailed: (job, why) => `#${job} का कदम नहीं भेजा जा सका: ${why}`,
  photoNeedsConnection: 'फ़ोटो जोड़ने के लिए इंटरनेट चाहिए। इंटरनेट आने पर फिर कोशिश करें।',
  planned: 'तय विज़िट',
  checklist: (done, total) => `चेकलिस्ट: ${total} में से ${done} पूरे`,
  checklistFirst: 'काम पूरा करने से पहले हर चेक पर टिक करें।',
  savedOffline: 'सेव हो गया। इंटरनेट आने पर भेज दिया जाएगा।',
  language: 'English',
};

const STRINGS: Record<Lang, Strings> = { en, hi };
const KEY = 'societyops_worker_lang';

function stored(): Lang {
  try {
    return localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function useWorkerLang() {
  const [lang, setLang] = useState<Lang>(stored);
  const toggle = () => {
    const next: Lang = lang === 'en' ? 'hi' : 'en';
    setLang(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
  };
  return { lang, t: STRINGS[lang], toggle };
}

export type WorkerStrings = Strings;
