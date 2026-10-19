// Page admin : relire les QCM un par un, retirer ou renommer une carte sans redéploiement.
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { QuestionView } from '@wm/shared';
import { Balance, Button, Chip, SectionLabel, StateBox } from '@wm/ui';
import { admin, HttpError } from '../api';
import s from './admin.module.css';

const KEY = 'wm-admin-token';

export function Admin() {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => sessionStorage.getItem(KEY) ?? '');
  const [tab, setTab] = useState<'questions' | 'cards'>('questions');

  if (!token) return <Login onToken={(v) => (sessionStorage.setItem(KEY, v), setToken(v))} />;
  const logout = () => (sessionStorage.removeItem(KEY), setToken(''));

  return (
    <div className={`wm-wrap ${s.page}`}>
      <div className={s.head}>
        <h1 className="wm-display">{t('admin.title')}</h1>
        <Button variant="quiet" onClick={logout}>
          {t('admin.logout')}
        </Button>
      </div>
      <div role="group" className={s.tabs}>
        <Chip pressed={tab === 'questions'} onClick={() => setTab('questions')}>
          {t('admin.questions')}
        </Chip>
        <Chip pressed={tab === 'cards'} onClick={() => setTab('cards')}>
          {t('admin.cards')}
        </Chip>
      </div>
      {tab === 'questions' ? (
        <Questions token={token} onDenied={logout} />
      ) : (
        <Cards token={token} onDenied={logout} />
      )}
    </div>
  );
}

function Login({ onToken }: { onToken: (t: string) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState('');
  return (
    <form
      className={`wm-wrap ${s.page} ${s.login}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onToken(v.trim());
      }}
    >
      <h1 className="wm-display">{t('admin.title')}</h1>
      <label className={s.field}>
        <span className="wm-mono">{t('admin.token')}</span>
        <input type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      <Button type="submit" variant="primary">
        {t('admin.enter')}
      </Button>
    </form>
  );
}

const denied = (e: unknown) => e instanceof HttpError && e.status === 401;

function Questions({ token, onDenied }: { token: string; onDenied: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [skip, setSkip] = useState(0);
  const q = useQuery({
    queryKey: ['admin-questions', skip],
    queryFn: () =>
      admin<{ pending: number; items: QuestionView[] }>(token, `/questions?verified=false&offset=${skip}`),
  });
  const done = () => qc.invalidateQueries({ queryKey: ['admin-questions'] });
  const save = useMutation({
    mutationFn: (b: Partial<QuestionView>) =>
      admin(token, `/questions/${b.id}`, 'PATCH', { ...b, id: undefined }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (id: string) => admin(token, `/questions/${id}`, 'DELETE'),
    onSuccess: done,
  });
  useEffect(() => {
    if (denied(q.error)) onDenied();
  }, [q.error, onDenied]);

  if (q.isPending) return <Balance />;
  if (q.isError) return <StateBox title={t('admin.unauthorized')} />;
  const cur = q.data.items[0];
  return (
    <section className={s.section}>
      <SectionLabel>{t('admin.pending', { n: q.data.pending })}</SectionLabel>
      {cur ? (
        <QuestionForm
          key={cur.id}
          q={cur}
          error={(save.error ?? remove.error)?.message}
          onValidate={(b) => save.mutate({ ...b, verified: true })}
          onSkip={() => setSkip(skip + 1)}
          onRemove={() => remove.mutate(cur.id)}
        />
      ) : (
        <StateBox title={t('admin.noPending')} />
      )}
    </section>
  );
}

function QuestionForm({
  q,
  error,
  onValidate,
  onSkip,
  onRemove,
}: {
  q: QuestionView;
  error?: string;
  onValidate: (b: Partial<QuestionView>) => void;
  onSkip: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState(q);
  const choice = (lang: 'choicesFr' | 'choicesEn', i: number, v: string) =>
    setF({ ...f, [lang]: f[lang].map((c, j) => (j === i ? v : c)) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onValidate({
      id: q.id,
      promptFr: f.promptFr,
      promptEn: f.promptEn,
      choicesFr: f.choicesFr,
      choicesEn: f.choicesEn,
      answerIndex: f.answerIndex,
    });
  };
  return (
    <form className={s.question} onSubmit={submit}>
      <p className="wm-mono">
        <a href={`/carte/${q.card.slug}`} target="_blank" rel="noopener">
          {q.card.name}
        </a>{' '}
        · {q.source}
      </p>
      <label className={s.field}>
        <span className="wm-mono">{t('admin.prompt')} FR</span>
        <input value={f.promptFr} onChange={(e) => setF({ ...f, promptFr: e.target.value })} />
      </label>
      <label className={s.field}>
        <span className="wm-mono">{t('admin.prompt')} EN</span>
        <input lang="en" value={f.promptEn} onChange={(e) => setF({ ...f, promptEn: e.target.value })} />
      </label>
      <fieldset className={s.choices}>
        <legend className="wm-mono">
          {t('admin.choices')} · {t('admin.answer')}
        </legend>
        {f.choicesFr.map((c, i) => (
          <div key={i} className={s.choice}>
            <input
              type="radio"
              name="answer"
              aria-label={`${t('admin.answer')} ${i + 1}`}
              checked={f.answerIndex === i}
              onChange={() => setF({ ...f, answerIndex: i })}
            />
            <input
              aria-label={`FR ${i + 1}`}
              value={c}
              onChange={(e) => choice('choicesFr', i, e.target.value)}
            />
            <input
              aria-label={`EN ${i + 1}`}
              lang="en"
              value={f.choicesEn[i]}
              onChange={(e) => choice('choicesEn', i, e.target.value)}
            />
          </div>
        ))}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className={s.actions}>
        <Button type="submit" variant="primary">
          {t('admin.validate')}
        </Button>
        <Button onClick={onSkip}>{t('admin.skip')}</Button>
        <Button variant="quiet" onClick={onRemove}>
          {t('admin.remove')}
        </Button>
      </div>
    </form>
  );
}

interface AdminCard {
  id: string;
  slug: string;
  number: number;
  type: string;
  rarity: string;
  status: 'ACTIVE' | 'RETIRED';
  nameFr: string;
  nameEn: string;
  overrideName: { fr?: string; en?: string } | null;
  overrideText: { fr?: string; en?: string } | null;
  overrideImage: string | null;
  plate: string | null;
  dialYear: number | null;
}

function Cards({ token, onDenied }: { token: string; onDenied: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['admin-cards', search],
    queryFn: () =>
      admin<{ total: number; items: AdminCard[] }>(token, `/cards?q=${encodeURIComponent(search)}`),
  });
  const plates = useQuery({
    queryKey: ['plates'],
    queryFn: () => admin<Record<string, { from: number; to: number }>>(token, '/plates'),
  });
  const save = useMutation({
    mutationFn: ({ id, ...b }: Partial<AdminCard> & { id: string }) =>
      admin(token, `/cards/${id}`, 'PATCH', b),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['admin-cards'] });
      void qc.invalidateQueries({ queryKey: ['cards'] });
    },
  });
  useEffect(() => {
    if (denied(q.error)) onDenied();
  }, [q.error, onDenied]);

  return (
    <section className={s.section}>
      <label className={s.field}>
        <span className="wm-mono">{t('admin.search')}</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {q.isPending ? (
        <Balance />
      ) : q.isError ? (
        <StateBox title={t('admin.unauthorized')} />
      ) : (
        <ul className={s.cards}>
          <SectionLabel count={q.data.items.length} total={q.data.total}>
            {t('admin.cards')}
          </SectionLabel>
          {q.data.items.map((c) => (
            <li key={c.id} className={s.cardRow} data-retired={c.status === 'RETIRED'}>
              <div className={s.cardLine}>
                <span className="wm-mono">{String(c.number).padStart(4, '0')}</span>
                <span className={s.cardName}>
                  {c.overrideName?.fr ?? c.nameFr}
                  {c.status === 'RETIRED' && <strong className="wm-mono"> · {t('admin.retired')}</strong>}
                </span>
                <span className="wm-mono wm-muted">
                  {t(`card:type.${c.type}`)} · {t(`card:rarity.${c.rarity}`)}
                </span>
                <Button
                  onClick={() =>
                    save.mutate({ id: c.id, status: c.status === 'ACTIVE' ? 'RETIRED' : 'ACTIVE' })
                  }
                >
                  {c.status === 'ACTIVE' ? t('admin.retire') : t('admin.restore')}
                </Button>
                <Button
                  variant="quiet"
                  aria-expanded={editing === c.id}
                  onClick={() => setEditing(editing === c.id ? null : c.id)}
                >
                  {t('admin.edit')}
                </Button>
              </div>
              {editing === c.id && (
                <CardForm
                  c={c}
                  plates={plates.data ?? {}}
                  error={save.error?.message}
                  onSave={(b) => save.mutate({ id: c.id, ...b })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CardForm({
  c,
  plates,
  error,
  onSave,
}: {
  c: AdminCard;
  plates: Record<string, { from: number; to: number }>;
  error?: string;
  onSave: (b: Partial<AdminCard>) => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    nameFr: c.overrideName?.fr ?? '',
    nameEn: c.overrideName?.en ?? '',
    textFr: c.overrideText?.fr ?? '',
    textEn: c.overrideText?.en ?? '',
    image: c.overrideImage ?? '',
    plate: c.plate ?? '',
    year: c.dialYear?.toString() ?? '',
  });
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(!!error), [error]);
  const field = (k: keyof typeof f, label: string, multi = false) => (
    <label className={s.field}>
      <span className="wm-mono">{label}</span>
      {multi ? (
        <textarea rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      ) : (
        <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      )}
    </label>
  );
  const loc = (fr: string, en: string) => (fr || en ? { fr: fr || undefined, en: en || undefined } : null);
  return (
    <form
      className={s.cardForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          overrideName: loc(f.nameFr, f.nameEn),
          overrideText: loc(f.textFr, f.textEn),
          overrideImage: f.image || null,
          plate: f.plate || null,
          dialYear: f.year ? Number(f.year) : null,
        });
      }}
    >
      {field('nameFr', `${t('admin.overrideName')} FR`)}
      {field('nameEn', `${t('admin.overrideName')} EN`)}
      {field('textFr', `${t('admin.overrideText')} FR`, true)}
      {field('textEn', `${t('admin.overrideText')} EN`, true)}
      {field('image', t('admin.overrideImage'))}
      <label className={s.field}>
        <span className="wm-mono">{t('admin.plate')}</span>
        <select value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })}>
          <option value="">{t('admin.none')}</option>
          {Object.entries(plates).map(([k, p]) => (
            <option key={k} value={k}>
              {k} ({p.from}–{p.to})
            </option>
          ))}
        </select>
      </label>
      <label className={s.field}>
        <span className="wm-mono">{t('admin.dialYear')}</span>
        <input
          inputMode="numeric"
          value={f.year}
          onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '') })}
        />
      </label>
      {shown && <p role="alert">{error}</p>}
      <Button type="submit" variant="primary">
        {t('admin.save')}
      </Button>
    </form>
  );
}
