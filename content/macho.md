---
title: 'Constructing a Valid Mach-O Executable'
date: 2025-07-16
description: 'What is the simplest executable we can make run on MacOS?'

extra:
  show_only_description: true
---

The Mach-O file format is the binary file format of executables on MacOS and iOS. There exist already [adjective] explanations of the format, but for the most part they are coming from the perspective of parsing existing Mach-O files, rather than creating them from scratch. The aim here is to, starting with just machine code, build up a Mach-O file that a modern MacOS[TODO: footnote - Specifically, this was testing on an M1 Macbook Pro running MacOS Sonoma 14.4] kernel agrees to execute.

---

First we need that machine code. We're going to make the smallest program that will have some sort of side effect to tell us whether it ran. Let's make a program that does nothing but return an exit code. Here it is in ARM64 assembly:
```asm
.global _main

_main:
    mov     x0, 64
    mov     x16, 1
    svc     0x80
```
- We move 64 into the `x0` register - this means our exit code will be 64
- We move 1 into the `x16` register - 1 is the identifier for the `AUE_EXIT` [system call TODO]
- Then we execute the `svc` instruction to tell the processor that we want to do a syscall. `0x80` is a convention? TODO ***

To get the corresponding machine code, we could consult the [Arm A-profile A64 Instruction Set Architecture](https://developer.arm.com/documentation/ddi0602/2025-03) and encode the instructions manually, but we'll take a shortcut and get the `as` assembler to do this for us:
```bash
$ as -o exit_syscall.o exit_syscall.S
```
And `objdump` to print out the contents:
```bash
$ objdump ./exit_syscall.o --disassemble

./exit_syscall.o:       file format mach-o arm64

Disassembly of section __TEXT,__text:

0000000000000000 <ltmp0>:
       0: d2800800      mov     x0, #64
       4: d2800030      mov     x16, #1
       8: d4001001      svc     #0x80
```
This means the machine code for our 3-instruction program is `[d2800800, d2800030, d4001001]`.
Now to figure out how we can put those instructions into our own Mach-O file!
## Mach-O File Format

We have two primary sources for info on Mach-O files:
- the XNU kernel code [xnu/EXTERNAL_HEADERS/macho/loader.h](https://github.com/apple-oss-distributions/xnu/blob/8d741a5de7ff4191bf97d57b9f54c2f6d4a15585/EXTERNAL_HEADERS/mach-o/loader.h) - which contains structure definitions, and explanations in the form of comments
- the [OS X ABI Mach-O File Format Reference](https://web.archive.org/web/20140904004108/https://developer.apple.com/library/mac/documentation/developertools/conceptual/MachORuntime/Reference/reference.html) - which contains diagrams but is out of date - it was last online in late 2014, prior to the release of OS X 10.10 Yosemite

Synthesising some information from the above sources, a Mach-O file consists of:
- a header
- some 'Load Commands' that define the structure of the data in the file and how it is to be loaded into memory
- data that is referenced by the Load Commands

![[Pasted image 20250527215053.png | 350]]

Each Mach-O is divided into a number of named areas called 'segments' that are loaded into memory as contiguous blocks, and data in a segment may be further divided into named 'sections'. For example, the `__TEXT` segment (note the uppercase name) contains the Mach-O header, load commands, and executable code, while the `__text` section (lowercase) within that segment refers to just the executable code. This is why `objdump` told us we were looking at the 'Disassembly of the `__TEXT,__text` section' earlier. We will explain other segments and sections as we come across the need for them.

![[Pasted image 20250527215938.png]]
### Header
This is defined as the `mach_header_64` struct in [`loader.h`](https://github.com/apple-oss-distributions/xnu/blob/8d741a5de7ff4191bf97d57b9f54c2f6d4a15585/EXTERNAL_HEADERS/mach-o/loader.h):
```rust
struct MachHeader64 {
    magic: u32,      // mach magic number identifier
    cputype: u32,    // cpu specifier
    cpusubtype: u32, // machine specifier
    filetype: u32,   // type of file
    ncmds: u32,      // number of load commands
    sizeofcmds: u32, // the size of all the load commands
    flags: u32,      // flags
    reserved: u32,   // reserved
}
```

Our header will look like this, at least to start with:
```rust
let mut header = MachHeader64 {
	magic: MH_MAGIC_64,              // these bytes tell the OS it is a Mach-O file
	cputype: CPU_TYPE_ARM64,         // since we are running on an M1 mac
	cpusubtype: CPU_SUBTYPE_ARM_ALL, // ^ as above
	filetype: MH_EXECUTE,            // we want a file that the OS can execute
	ncmds: 0,                        // will be incremented as we go
	sizeofcmds: 0,                   // will be incremented as we go
	flags: 0,                        // we don't know what flags to include yet
	reserved: 0,
};
```
We'll also add a counter that tells us the total length of the file:
```rust
let mut bytes_reserved = 0;
bytes_reserved += std::mem::size_of::<MachHeader64>();
```

### Load Commands, Segments and Sections
Above we learned that our machine code should go in the `__text` section, inside a `__TEXT` segment. We can create a segment using the `LC_SEGMENT_64` load command, and follow it with a `section64` header:

```rust
struct SegmentCommand64 {
    cmd: u32,          // LC_SEGMENT_64
    cmdsize: u32,      // includes sizeof section_64 structs
    segname: [u8; 16], // segment name
    vmaddr: u64,       // memory address of this segment
    vmsize: u64,       // memory size of this segment
    fileoff: u64,      // file offset of this segment
    filesize: u64,     // amount to map from the file
    maxprot: u32,      // maximum vm protection
    initprot: u32,     // initial vm protection
    nsects: u32,       // number of sections in segment
    flags: u32,
}

struct Section64 {
    sectname: [u8; 16], // e.g. __text
    segname: [u8; 16],  // must match the segment to which it belongs
    addr: u64,          // virtual memory address
    size: u64,          // size once loaded into memory
    offset: u32,        // file offset of the section data
    align: u32,
    reloff: u32,
    nreloc: u32,
    flags: u32,
    reserved1: u32,
    reserved2: u32,
    reserved3: u32,
}
```

We'll fill ours in like this:
```rust
let text_section_data: [u32; 3] = [0xd2800800, 0xd2800030, 0xd4001001];

let text_segment_vmaddr = 0x100000000;
let mut text_segment_lc = SegmentCommand64 {
	cmd: LC_SEGMENT_64,
	cmdsize: std::mem::size_of::<SegmentCommand64>() as u32
		+ std::mem::size_of::<Section64>() as u32,
	segname: *b"__TEXT\0\0\0\0\0\0\0\0\0\0",
	vmaddr: text_segment_vmaddr,
	vmsize: 0x0,   // filled in later
	fileoff: 0x0,  // __TEXT segment begins at the very start of the file
	filesize: 0x0, // filled in later
	maxprot: VM_PROT_READ | VM_PROT_EXECUTE,
	initprot: VM_PROT_READ | VM_PROT_EXECUTE,
	nsects: 1,
	flags: 0x0,
};
text_segment_lc.filesize =
	text_segment_lc.cmdsize as u64 + std::mem::size_of_val(&text_section_data) as u64;
text_segment_lc.vmsize = align(text_segment_lc.filesize, 0x4000);
bytes_reserved += std::mem::size_of_val(&text_segment_lc);

let mut text_section_header = Section64 {
	sectname: *b"__text\0\0\0\0\0\0\0\0\0\0",
	segname: *b"__TEXT\0\0\0\0\0\0\0\0\0\0",
	addr: 0x0, // filled in later
	size: std::mem::size_of_val(&text_section_data) as u64,
	offset: 0x0, // filled in later
	align: 0x2,
	reloff: 0x0,
	nreloc: 0x0,
	flags: 0x80000400,
	reserved1: 0x0,
	reserved2: 0x0,
	reserved3: 0x0,
};
bytes_reserved += std::mem::size_of_val(&text_section_header);
text_section_header.offset = bytes_reserved as u32;
```
And update the file header:
```rust
header.ncmds += 1;
header.sizeofcmds += text_segment_lc.cmdsize;
```
Finally we write all this to a file and make it executable:
```rust
let mut output = File::create("return64")?;
output.write_all(bytes_of(&header))?;
output.write_all(bytes_of(&text_segment_lc))?;
output.write_all(bytes_of(&text_section_header))?;
output.write_all(bytes_of(&text_section_data))?;
let executable = Permissions::from_mode(0o755);
std::fs::set_permissions("return64", executable)?;
```

Awesome, it has been a bit of work to get to this stage, but by now we have a Mach-O executable with a header, a `__TEXT` segment, and inside that a `__text` section containing our machine code. `otool` can show us the details and doesn't complain:
```bash
$ otool -lhtv return64
return64:
Mach header
      magic  cputype cpusubtype  caps    filetype ncmds sizeofcmds      flags
MH_MAGIC_64    ARM64        ALL  0x00     EXECUTE     1        152 0x00000000
Load command 0
      cmd LC_SEGMENT_64
  cmdsize 152
  segname __TEXT
   vmaddr 0x0000000000000000
   vmsize 0x0000000000004000
  fileoff 0
 filesize 164
  maxprot ---
 initprot ---
   nsects 1
    flags (none)
Section
  sectname __text
   segname __TEXT
      addr 0x0000000000000000
      size 0x000000000000000c
    offset 184
     align 2^0 (1)
    reloff 0
    nreloc 0
      type S_REGULAR
attributes (none)
 reserved1 0
 reserved2 0
(__TEXT,__text) section
0000000000000000        mov     x0, #0x40
0000000000000004        mov     x16, #0x1
0000000000000008        svc     #0x80
```

Let's try to run it!
```bash
$ ./return64
Killed: 9
```
Oh. I guess it wasn't going to be that easy.

## mach_loader.c 
To figure out the rest of the requirements we will need to dive into the source code that Apple provides for the XNU kernel, specifically the `parse_machfile()` function in [`mach_loader.c`](https://github.com/apple-oss-distributions/xnu/blob/e3723e1f17661b24996789d8afc084c0c3303b26/bsd/kern/mach_loader.c#L140).

Here are the relevant excerpts:

```C
if (header->flags & MH_DYLDLINK) {
	/* Check properties of dynamic executables */
	if (!(header->flags & MH_PIE) && pie_required(header->cputype, header->cpusubtype & ~CPU_SUBTYPE_MASK)) {
		return LOAD_FAILURE;
	}
	result->needs_dynlinker = TRUE;
} 
...
} else {
...
	return LOAD_FAILURE;
}
```
This tells us we must set the DYLD_LINK and MH_PIE flags in the file header.

```C
case LC_LOAD_DYLINKER:
	...
		dlp = (struct dylinker_command *)lcp;
	...

// combined with:
if (ret == LOAD_SUCCESS) {
	...
	/* Make sure if we need dyld, we got it */
	if (result->needs_dynlinker && !dlp) {
		ret = LOAD_FAILURE;
	}
}
```
We need a LOAD_DYLINKER load command.

```C
if (ret == LOAD_SUCCESS && scp64->fileoff == 0 && scp64->filesize > 0) {
	/* Enforce a single segment mapping offset zero, with R+X
	 * protection. */
	if (found_header_segment ||
		((scp64->initprot & (VM_PROT_READ | VM_PROT_EXECUTE)) != (VM_PROT_READ | VM_PROT_EXECUTE))) {
		ret = LOAD_BADMACHO;
		break;
	}
	found_header_segment = TRUE;
}
```
The first segment we load must have initprot set to READ and EXECUTE.

```C
if ((file_offset & PAGE_MASK_64) != 0 ||
	/* we can't mmap() it if it's not page-aligned in the file */
	...
	return LOAD_BADMACHO;
}
```
All segments must be aligned to an offset in the file that is a multiple of the 16kiB page size. This is already the case since the `__TEXT` segment has offset 0, but we will need to take this into account when adding more segments.

```C
if (!got_code_signatures && cs_process_global_enforcement()) {
	ret = LOAD_FAILURE;
}
// combined with
case LC_CODE_SIGNATURE:
	/* CODE SIGNING */
	...
		got_code_signatures = TRUE;
	...
```
We need a CODE_SIGNATURE load command.

```C
if (result->thread_count == 0) {
	ret = LOAD_FAILURE;
}
// combined with
static load_return_t load_main(... )
{
...
	result->thread_count++;
...
```
We need LC_MAIN or LC_UNIXTHREAD. We choose LC_MAIN over LC_UNIXTHREAD as it is simpler.

```C
if (enforce_hard_pagezero &&
	/* 64 bit ARM binary must have "hard page zero" of 4GB to cover the lower 32 bit address space */
	(vm_map_has_hard_pagezero(map, 0x100000000) == FALSE)) {
...
		return LOAD_BADMACHO;
	}
}
```
We need a 'PAGEZERO' segment.

```c
if (scp->initprot == 0 && scp->maxprot == 0 && scp->vmaddr == 0) {
	/* PAGEZERO */
	if (os_add3_overflow(scp->vmaddr, scp->vmsize, slide, &pagezero_end) || pagezero_end > UINT32_MAX) {
		ret = LOAD_BADMACHO;
		break;
	}
}
```
The PAGEZERO segment must have `initprot` and `maxprot` set to `VM_PROT_NONE` (0).

Summarising, we need to add:
- `__PAGEZERO` segment of size 4GB, starting at vmaddr of 0x0, with initprot and maxprot set to 0
- `LC_MAIN` load command
- `LC_LOAD_DYLINKER` load command
- `LC_CODE_SIGNATURE` load command

Going through those:
`__PAGEZERO` is straightforward, it is just another `LC_SEGMENT_64` command:
```rust
let pagezero_seg_lc = SegmentCommand64 {
	cmd: LC_SEGMENT_64,
	cmdsize: std::mem::size_of::<SegmentCommand64>() as u32,
	segname: *b"__PAGEZERO\0\0\0\0\0\0",
	vmaddr: 0x0,
	vmsize: 0x100000000,
	fileoff: 0x0,  // empty so we don't need an offset
	filesize: 0x0, // empty so we don't need a physical size
	maxprot: 0x0,  // must be VM_PROT_NONE for PAGEZERO
	initprot: 0x0, // must be VM_PROT_NONE for PAGEZERO
	nsects: 0,     // doesn't contain any sections
	flags: 0x0,
};
bytes_reserved += std::mem::size_of_val(&pagezero_seg_lc);
header.ncmds += 1;
header.sizeofcmds += pagezero_seg_lc.cmdsize;
```

For `LC_MAIN`, we just need to make sure we compute the correct file offset of the `__text` section data:
```rust
bytes_reserved += std::mem::size_of::<EntryPointCommand>();
text_section_header.addr = (bytes_reserved as u64 + text_segment_vmaddr) as u64;
let mut main_lc = EntryPointCommand {
	cmd: LC_MAIN,
	cmdsize: std::mem::size_of::<EntryPointCommand>() as u32,
	entryoff: 0,  // Updated later
	stacksize: 0, // if we put zero, the kernel fills it with a default value
};
header.ncmds += 1;
header.sizeofcmds += main_lc.cmdsize;
```

We can fix our flags as so:
```rust
header.flags = MH_PIE | MH_DYLDLINK;
```

Add `LC_LOAD_DYLINKER`:
```rust
let dylinker_name = "/usr/lib/dyld".to_string();
let padded_cmd_len = align(
	std::mem::size_of::<DylinkerCommand>() as u64 + dylinker_name.len() as u64,
	8,
); // cmdsize must be a multiple of 8, so we add padding
let padded_name_len = padded_cmd_len as usize - std::mem::size_of::<DylinkerCommand>();
let mut padded_dylinker_name = vec![0; padded_name_len];
padded_dylinker_name[..dylinker_name.len()].copy_from_slice(&dylinker_name.as_bytes());

let dylinker_lc = DylinkerCommand {
	cmd: LC_LOAD_DYLINKER,
	cmdsize: (std::mem::size_of::<DylinkerCommand>() + padded_dylinker_name.len()) as u32,
	name: std::mem::size_of::<DylinkerCommand>() as u32,
};
bytes_reserved += dylinker_lc.cmdsize as usize;
header.ncmds += 1;
header.sizeofcmds += dylinker_lc.cmdsize;
```

## Sign here please - Adding a code signature
The code signature is another story. All binaries are required to be signed before they are run. For programs that will be distributed, this would be performed using an official Apple Developer account, but there is a type of signature called an 'ad-hoc' signature that allows a program to run on your computer only. You can read [llios/macho_parser](https://github.com/qyang-nj/llios/blob/main/macho_parser/docs/LC_CODE_SIGNATURE.md) for details on the format of code signatures, as we will delegate code signing to the [rcodesign](https://gregoryszorc.com/docs/apple-codesign/0.17.0/apple_codesign_getting_started.html#installing) utility that has re-implemented Apple's code signing process. It doesn't do all the work for us: it can only replace an existing signature, so we must write our own empty one first and place it in the `__LINKEDIT` segment.

First we create the `__LINKEDIT` segment:
```rust
let mut linkedit_seg_lc = SegmentCommand64 {
	cmd: LC_SEGMENT_64,
	cmdsize: std::mem::size_of::<SegmentCommand64>() as u32,
	segname: *b"__LINKEDIT\0\0\0\0\0\0",
	vmaddr: text_segment_lc.vmaddr + text_segment_lc.vmsize,
	vmsize: 0x4000,
	fileoff: 0,  // Updated later
	filesize: 0, // Updated later
	maxprot: 0x0,
	initprot: 0x0,
	nsects: 0,
	flags: 0,
};
bytes_reserved += linkedit_seg_lc.cmdsize as usize;
header.ncmds += 1;
header.sizeofcmds += linkedit_seg_lc.cmdsize;
```

Then we create a load command for the code signature:
```rust
let mut codesig_lc = LinkeditDataCommand {
	cmd: LC_CODE_SIGNATURE,
	cmdsize: std::mem::size_of::<LinkeditDataCommand>() as u32,
	dataoff: 0,  // Updated later
	datasize: 0, // Updated later
};
header.ncmds += 1;
header.sizeofcmds += codesig_lc.cmdsize;
bytes_reserved += codesig_lc.cmdsize as usize;
```

Since this is now the final load command, we update the text section offset:
```rust
text_section_header.offset = bytes_reserved as u32;
bytes_reserved += std::mem::size_of_val(&text_section_data);
main_lc.entryoff = text_section_header.offset as u64;
text_section_header.addr = (text_section_header.offset as u64 + text_segment_vmaddr) as u64;
```

To ensure that the start of the `__LINKEDIT` segment is page-aligned, we must add padding to the end of the `__TEXT` segment:
```rust
let text_sec_end = align(
	text_section_header.offset as u64 + text_section_data.len() as u64,
	0x4000,
);
let text_seg_padding_len =
	text_sec_end - text_section_header.offset as u64 - size_of_val(&text_section_data) as u64;
bytes_reserved += text_seg_padding_len as usize;
text_segment_lc.filesize = bytes_reserved as u64;
if text_segment_lc.filesize % 0x4000 != 0 {
	text_segment_lc.vmsize = align(text_segment_lc.filesize, 0x4000);
}
```

Now we add a placeholder for the code signature, to satisfy `rcodesign`:
```rust
let mut codesig = [0; 16];
let superblob_length: u32 = 12;
let superblob_count: u32 = 0;
codesig[0..4].copy_from_slice(&CSMAGIC_EMBEDDED_SIGNATURE.to_be_bytes());
codesig[4..8].copy_from_slice(&superblob_length.to_be_bytes());
codesig[8..12].copy_from_slice(&superblob_count.to_be_bytes());
// Update linkedit details
linkedit_seg_lc.fileoff = bytes_reserved as u64;
linkedit_seg_lc.filesize = codesig.len() as u64;
codesig_lc.dataoff = bytes_reserved as u32;
codesig_lc.datasize = codesig.len() as u32;
```

We write the binary to a file, much like before:
```rust
let mut output = File::create("return64")?;
output.write_all(bytes_of(&header))?;
output.write_all(bytes_of(&text_segment_lc))?;
output.write_all(bytes_of(&text_section_header))?;
output.write_all(bytes_of(&pagezero_seg_lc))?;
output.write_all(bytes_of(&main_lc))?;
output.write_all(bytes_of(&dylinker_lc))?;
output.write_all(&padded_dylinker_name)?;
output.write_all(bytes_of(&linkedit_seg_lc))?;
output.write_all(bytes_of(&codesig_lc))?;
output.write_all(bytes_of(&dysymtab_lc))?;
output.write_all(bytes_of(&symtab_lc))?;
output.write_all(bytes_of(&text_section_data))?;
output.write_all(&vec![0; text_seg_padding_len as usize])?;
output.write_all(&codesig)?;
let executable = Permissions::from_mode(0o755);
std::fs::set_permissions("return64", executable)?;
```

Finally we can perform the code signing step:
```rust
let file_bytes = std::fs::read("return64")?;
let signer = apple_codesign::MachOSigner::new(&file_bytes)?;
let mut output = File::create("return64")?;
let mut settings = SigningSettings::default();
settings.set_binary_identifier(SettingsScope::Main, "com.simple_macho.return64");
signer.write_signed_binary(&settings, &mut output)?;
```

Running the resulting binary does not quite work:
```bash
$ ./return64
Segmentation fault: 11

$ lldb return64
(lldb) target create "return64"
Current executable set to '/simple_macho/return64' (arm64).
(lldb) run
Process 16199 launched: '/simple_macho/return64' (arm64)
Process 16199 stopped
* thread #1, stop reason = EXC_BAD_ACCESS (code=1, address=0x48)
    frame #0: 0x000000019102770c dyld`dyld3::MachOAnalyzer::forEachRebase_Relocations(Diagnostics&, dyld3::MachOLoaded::LinkEditInfo const&, dyld3::MachOFile::SegmentInfo const*, void (char const*, dyld3::MachOLoaded::LinkEditInfo const&, dyld3::MachOFile::SegmentInfo const*, bool, unsigned int, unsigned char, unsigned long long, dyld3::MachOAnalyzer::Rebase, bool&) block_pointer) const + 120
dyld`dyld3::MachOAnalyzer::forEachRebase_Relocations:
->  0x19102770c <+120>: ldr    w2, [x8, #0x48]
    0x191027710 <+124>: mov    x0, x20
    0x191027714 <+128>: mov    x1, x24
    0x191027718 <+132>: bl     0x19101b51c               ; dyld3::MachOLoaded::getLinkEditContent(dyld3::MachOLoaded::LayoutInfo const&, unsigned int) const
Target 0: (return64) stopped.
```
## SYMTAB and DYSYMTAB
We seem to be getting a null pointer dereference inside DYLD, the dynamic loader. I couldn't track down any documentation explicitly stating this, but experimentation confirms that DYLD requires DYSYMTAB and SYMTAB load commands to be present. Luckily, we can create empty tables, by adding these load commands:
```rust
let dysymtab_lc = DysymtabCommand {
	cmd: LC_DYSYMTAB,
	cmdsize: std::mem::size_of::<DysymtabCommand>() as u32,
	ilocalsym: 0,
	nlocalsym: 0,
	iextdefsym: 0,
	nextdefsym: 0,
	iundefsym: 0,
	nundefsym: 0,
	tocoff: 0,
	ntoc: 0,
	modtaboff: 0,
	nmodtab: 0,
	extrefsymoff: 0,
	nextrefsyms: 0,
	indirectsymoff: 0,
	nindirectsyms: 0,
	extreloff: 0,
	nextrel: 0,
	locreloff: 0,
	nlocrel: 0,
};
header.ncmds += 1;
header.sizeofcmds += dysymtab_lc.cmdsize;
bytes_reserved += dysymtab_lc.cmdsize as usize;

let symtab_lc = SymtabCommand {
	cmd: LC_SYMTAB,
	cmdsize: std::mem::size_of::<SymtabCommand>() as u32,
	symoff: 0,
	nsyms: 0,
	stroff: 0,
	strsize: 0,
};
header.ncmds += 1;
header.sizeofcmds += symtab_lc.cmdsize;
bytes_reserved += symtab_lc.cmdsize as usize;

...
let mut output = File::create("return64")?;
output.write_all(bytes_of(&header))?;
...
output.write_all(bytes_of(&codesig_lc))?;
output.write_all(bytes_of(&dysymtab_lc))?;
output.write_all(bytes_of(&symtab_lc))?;
output.write_all(bytes_of(&text_section_data))?;
...

```
## At last, a working executable
We can run the program and print its return code:
```bash
$ ./return64
$ echo $?
64
```
The final file consists of:

![[Pasted image 20250705230821.png]]
This is the simplest Mach-O valid executable that I could construct

