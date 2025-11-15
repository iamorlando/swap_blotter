"use client";

import * as React from "react";
import Modal from "@/components/Modal";
import { useParams } from "next/navigation";

export default function SwapModalPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  return (
    <Modal title={`Swap ${id}`}>
      <div className="space-y-3 text-sm text-gray-200">
        <div>
          Swap ID: <span className="font-mono text-blue-300">{id}</span>
        </div>
        <div className="text-gray-400">
          Detail view coming next. This modal preserves the running datafeed and calibration workers.
        </div>
      </div>
    </Modal>
  );
}

