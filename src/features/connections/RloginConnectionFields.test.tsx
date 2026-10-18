// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { t } from "../../shared/i18n";
import { RloginConnectionFields } from "./RloginConnectionFields";
import { defaultAdvancedConfig, defaultRloginConfig } from "./connectionTypes";
import type { ConnectionProfileInput } from "./connectionTypes";
afterEach(cleanup);
function Form({ onChange=vi.fn() }: { onChange?:(form:ConnectionProfileInput)=>void }) {
  const [form,setForm]=useState<ConnectionProfileInput>({protocol:"rlogin",host:"127.0.0.1",port:513,username:"RemoteCase",credential_mode:"prompt",proxy:{kind:"none"},jump:{kind:"none"},advanced:{...defaultAdvancedConfig},rlogin:{...defaultRloginConfig,local_address:"127.0.0.1",local_user:"LocalCase"}});
  return <form aria-label="fixture-form"><RloginConnectionFields form={form} groupOptions={[]} onChange={next=>{setForm(next);onChange(next);}} /></form>;
}
describe("Rlogin actual configuration fields",()=>{
  it("shows independent required targets/users without password or SSH authentication fields",()=>{
    render(<Form />);
    for(const key of ["remoteAddress","localAddress","remoteUser","localUser","terminal","speed"] as const) {
      expect((screen.getByLabelText(t(`connectionDialog.rlogin.${key}`)) as HTMLInputElement).required).toBe(true);
    }
    expect(screen.getByLabelText(t("connectionDialog.rlogin.remoteUser"))).toHaveProperty("value","RemoteCase");
    expect(screen.getByLabelText(t("connectionDialog.rlogin.localUser"))).toHaveProperty("value","LocalCase");
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
  it("edits local and remote fields independently and never replaces a cleared port/speed with defaults",()=>{
    const onChange=vi.fn();render(<Form onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t("connectionDialog.rlogin.localUser")),{target:{value:"DifferentLocal"}});
    expect(screen.getByLabelText(t("connectionDialog.rlogin.remoteUser"))).toHaveProperty("value","RemoteCase");
    fireEvent.change(screen.getByLabelText(t("connectionDialog.field.port")),{target:{value:""}});
    expect(onChange.mock.lastCall?.[0].port).toBe(0);
    fireEvent.change(screen.getByLabelText(t("connectionDialog.rlogin.speed")),{target:{value:""}});
    expect(onChange.mock.lastCall?.[0].rlogin?.speed).toBe(0);
    expect((screen.getByRole("form") as HTMLFormElement).checkValidity()).toBe(false);
  });
  it("uses the existing encoding dropdown and updates only the selected encoding",()=>{
    const onChange=vi.fn();render(<Form onChange={onChange} />);
    fireEvent.click(screen.getByRole("button",{name:t("connectionDialog.advanced.encoding")}));
    const option=screen.getAllByRole("option").find(item=>item.textContent?.includes("Big5"));
    expect(option).toBeDefined();fireEvent.click(option!);
    expect(onChange.mock.lastCall?.[0].advanced.terminal_encoding).toBe("big5");
    expect(onChange.mock.lastCall?.[0].username).toBe("RemoteCase");
    expect(onChange.mock.lastCall?.[0].rlogin?.local_user).toBe("LocalCase");
  });
});
