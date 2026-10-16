// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalFileService } from "./LocalFileService";
import { setLocalePreference } from "../../shared/i18n";
import { fileServiceAudit, fileServiceReserve, fileServiceStart, fileServiceStatus, fileServiceStop } from "../../shared/tauri/commands";
import { selectFileServiceFile } from "../../shared/tauri/dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
vi.mock("../../shared/tauri/commands",()=>({fileServiceAudit:vi.fn(),fileServiceReserve:vi.fn(),fileServiceStart:vi.fn(),fileServiceStatus:vi.fn(),fileServiceStop:vi.fn()}));
vi.mock("../../shared/tauri/dialog",()=>({selectFileServiceFile:vi.fn()}));
vi.mock("@tauri-apps/plugin-clipboard-manager",()=>({writeText:vi.fn().mockResolvedValue(undefined)}));
beforeEach(()=>{vi.resetAllMocks();setLocalePreference("en");vi.mocked(fileServiceStatus).mockResolvedValue(null);vi.mocked(fileServiceAudit).mockResolvedValue([]);vi.mocked(fileServiceStop).mockResolvedValue();});
afterEach(()=>{cleanup();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;});
it("browser preview never reserves, starts or polls a simulated service",()=>{
 render(<LocalFileService active/>);expect(screen.getByText("Available in the desktop app.")).toBeTruthy();
 expect((screen.getByRole("button",{name:"Start service"}) as HTMLButtonElement).disabled).toBe(true);
 expect(fileServiceStatus).not.toHaveBeenCalled();expect(fileServiceReserve).not.toHaveBeenCalled();
});
it("explicit file selection and start show local scope and copy only on user action",async()=>{
 Object.assign(window,{__TAURI_INTERNALS__:{}});vi.mocked(selectFileServiceFile).mockResolvedValue("/private/selected.txt");
 vi.mocked(fileServiceReserve).mockResolvedValue("lease");vi.mocked(fileServiceStart).mockResolvedValue({status:{id:"lease",phase:"running",port:12345,size:12},token:"a".repeat(43)});
 render(<LocalFileService active/>);fireEvent.click(screen.getByRole("button",{name:"Choose file"}));
 await waitFor(()=>expect((screen.getByLabelText("Selected file") as HTMLInputElement).value).toBe("selected.txt"));
 expect(fileServiceStart).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText("Port (0 = automatic)"),{target:{value:"22"}});
 expect((screen.getByRole("button",{name:"Start service"}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Port (0 = automatic)"),{target:{value:"0"}});fireEvent.click(screen.getByRole("button",{name:"Start service"}));
 await waitFor(()=>expect(screen.getByText("Service running")).toBeTruthy());expect(fileServiceStart).toHaveBeenCalledWith("lease","/private/selected.txt",0);
 expect(writeText).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Copy curl download command"}));
 await waitFor(()=>expect(writeText).toHaveBeenCalled());const command=vi.mocked(writeText).mock.calls[0][0];
 expect(command).toContain("Authorization: Bearer "+"a".repeat(43));expect(command).toContain("http://127.0.0.1:12345/file");expect(command).not.toContain("/private");
 fireEvent.click(screen.getByRole("button",{name:"Stop service"}));await waitFor(()=>expect(screen.getByText("Service stopped")).toBeTruthy());expect(screen.queryByLabelText("Temporary access token")).toBeNull();
});
it("discarding a late picker response after leaving does not change selection",async()=>{
 Object.assign(window,{__TAURI_INTERNALS__:{}});let resolve!: (value:string)=>void;vi.mocked(selectFileServiceFile).mockReturnValue(new Promise(r=>{resolve=r}));
 const f=render(<LocalFileService active/>);fireEvent.click(screen.getByRole("button",{name:"Choose file"}));f.rerender(<LocalFileService active={false}/>);
 await act(async()=>{resolve("/private/late.txt");});f.rerender(<LocalFileService active/>);
 expect((screen.getByLabelText("Selected file") as HTMLInputElement).value).toBe("");expect((screen.getByRole("button",{name:"Choose file"}) as HTMLButtonElement).disabled).toBe(false);
});
