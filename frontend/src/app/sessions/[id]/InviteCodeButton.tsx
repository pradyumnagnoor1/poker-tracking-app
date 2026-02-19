"use client";

import { useState } from "react";

export default function InviteCodeButton({ code }: { code: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-2 mt-0.5 group"
        >
            <span className="font-mono tracking-widest text-sm font-bold text-white bg-gray-800 px-2 py-0.5 rounded">
                {code}
            </span>
            <span className={`text-xs transition-colors ${copied ? "text-green-400" : "text-gray-500 group-hover:text-gray-300"}`}>
                {copied ? "Copied!" : "Copy invite"}
            </span>
        </button>
    );
}
