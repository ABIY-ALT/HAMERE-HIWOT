'use client';

import React, { useState } from 'react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { useProperty } from '@/lib/property/client';
import { isHeld } from '@/lib/property/types';
import {
  AssetDetails,
  AssetFormDialog,
  CloseJobDialog,
  RepairDialog,
  TransferDialog,
  VerifyDialog,
  type AssetAction,
} from './AssetDialogs';

type View = { assetId: string; view: 'details' | AssetAction | 'new' | 'pick'; then?: AssetAction } | { jobId: string; view: 'close' };

/**
 * Opens the property dialogs from any page: asset details (with history),
 * register / edit, transfer, repair, stocktake, close a job — and an asset
 * picker for pages that start from "New transfer" / "Report repair".
 */
export function useAssetDialogs(onDone: (message: string) => void) {
  const { t, locale } = useLang();
  const { assets, maintenance } = useProperty();
  const [view, setView] = useState<View | null>(null);
  const [picked, setPicked] = useState('');

  const close = () => setView(null);
  const done = (message: string) => {
    setView(null);
    onDone(message);
  };

  let node: React.ReactNode = null;
  if (view && 'jobId' in view) {
    const job = maintenance.find((j) => j.id === view.jobId);
    if (job) node = <CloseJobDialog job={job} asset={assets.find((a) => a.id === job.asset_id)} onClose={close} onDone={done} />;
  } else if (view?.view === 'new') {
    node = <AssetFormDialog onClose={close} onDone={done} />;
  } else if (view?.view === 'pick') {
    const options = assets.filter(isHeld);
    node = (
      <Modal isOpen onClose={close} title={t('Choose the asset', 'ንብረቱን ይምረጡ')}>
        <div className="space-y-4">
          <select value={picked} onChange={(e) => setPicked(e.target.value)} className="form-input text-sm">
            <option value="">{t('— Choose —', '— ይምረጡ —')}</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.tag} · {locale === 'am' ? a.name_am : a.name_en}
                {a.custodian ? ` (${a.custodian})` : ''}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={close} className="btn btn-secondary text-xs">{t('Cancel', 'ሰርዝ')}</button>
            <button disabled={!picked} onClick={() => setView({ assetId: picked, view: view.then ?? 'details' })} className="btn btn-primary text-xs disabled:opacity-50">
              {t('Continue', 'ቀጥል')}
            </button>
          </div>
        </div>
      </Modal>
    );
  } else if (view) {
    const asset = assets.find((a) => a.id === view.assetId);
    if (asset) {
      if (view.view === 'details') node = <AssetDetails asset={asset} onClose={close} onDone={done} onAction={(a) => setView({ assetId: asset.id, view: a })} />;
      if (view.view === 'edit') node = <AssetFormDialog asset={asset} onClose={close} onDone={done} />;
      if (view.view === 'transfer') node = <TransferDialog asset={asset} onClose={close} onDone={done} />;
      if (view.view === 'repair') node = <RepairDialog asset={asset} onClose={close} onDone={done} />;
      if (view.view === 'verify') node = <VerifyDialog asset={asset} onClose={close} onDone={done} />;
    }
  }

  return {
    node,
    openAsset: (assetId: string, v: 'details' | AssetAction = 'details') => setView({ assetId, view: v }),
    openNew: () => setView({ assetId: '', view: 'new' }),
    pickThen: (action: AssetAction) => {
      setPicked('');
      setView({ assetId: '', view: 'pick', then: action });
    },
    closeJob: (jobId: string) => setView({ jobId, view: 'close' }),
  };
}
