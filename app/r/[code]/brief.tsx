import Image from 'next/image'
import { CLUSTER_STYLES, clusterLabel, type ClusterStyle } from '@/lib/onboarding'
import { SETTING_COPY, SETTING_QUESTION, type SettingChoice } from '@/lib/setting'
import type { Onboarding } from '@/lib/onboarding-view'
import SettingChooser from './welcome/setting-chooser'
import { ClusterChooser, DesignerNotes, StaffQuestions } from './welcome/sections'
import { BriefShell } from './brief-shell'

/**
 * "Your brief": what the customer told us before design began. After Version
 * One it moves off the main page into a panel (desktop: a slim tab on the
 * right; phone: one collapsed row). Answered items show as a summary;
 * anything still open (e.g. a question added later) can be answered here.
 */
export function BriefPanel({ code, ob, size, sizeConfirmed, settingChoice, clusterStyles, clusterSaved, open }: {
  code: string; ob: Onboarding
  size: string | null; sizeConfirmed: boolean
  settingChoice: SettingChoice | null
  clusterStyles: string[]; clusterSaved: boolean
  open: boolean
}) {
  const toDo = ob.progress.total - ob.progress.done
  return (
    <BriefShell toDo={toDo} initialOpen={open}>
      <Item title="Ring size">
        {sizeConfirmed
          ? <p className="font-serif text-2xl text-cocoa-dark">{size}</p>
          : <p className="text-[15px] text-ink">Not confirmed yet. <a href="#ring-size" className="text-cocoa underline underline-offset-4">Add it at the top</a>.</p>}
      </Item>

      {ob.showSetting && (
        <Item title="Setting height">
          {settingChoice ? (
            <div className="flex items-center gap-3">
              {ob.settingImages[settingChoice] && (
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-sand bg-linen">
                  <Image src={ob.settingImages[settingChoice]!} alt="" fill sizes="64px" className="object-contain" />
                </span>
              )}
              <div>
                <p className="text-[13px] font-semibold tracking-[0.16em] text-cocoa-dark">{SETTING_COPY[settingChoice].heading}</p>
                <p className="text-[15px] text-ink">{SETTING_COPY[settingChoice].subheading}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="font-serif text-lg leading-snug text-cocoa">{SETTING_QUESTION}</p>
              <SettingChooser code={code} initial={null} locked={false} images={ob.settingImages} compact />
            </>
          )}
        </Item>
      )}

      {ob.clusterOn && (
        <Item title="Cluster style">
          {clusterSaved && clusterStyles.length ? (
            <ul className="space-y-0.5 text-[15px] text-ink">
              {CLUSTER_STYLES.filter(s => clusterStyles.includes(s.key)).map(s => <li key={s.key}>{clusterLabel(s.key as ClusterStyle)}</li>)}
            </ul>
          ) : (
            <>
              <p className="text-[15px] text-ink">Which cluster styles do you like? Choose any.</p>
              <ClusterChooser code={code} initial={clusterStyles} saved={clusterSaved} locked={false} images={ob.clusterImages} compact />
            </>
          )}
        </Item>
      )}

      {ob.questions.length > 0 && (
        <Item title="Questions from us">
          <StaffQuestions code={code} locked={ob.locked} questions={ob.questions} />
        </Item>
      )}

      <Item title="Your notes">
        <DesignerNotes code={code} sent={ob.notes} />
      </Item>
    </BriefShell>
  )
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-sand py-5 first:border-t-0 first:pt-1">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cocoa-light">{title}</h3>
      {children}
    </section>
  )
}
