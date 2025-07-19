# Mach-O General
https://alexdremov.me/mystery-of-mach-o-object-file-builders/ asserts that SYMTAB and DYSYMTAB are required. Investigating `init_from_final_linked_image()`
Archive of Mac OSx abi stuff https://web.archive.org/web/20140904004108/https://developer.apple.com/library/mac/documentation/developertools/conceptual/MachORuntime/Reference/reference.html
https://www.reinterpretcast.com/hello-world-mach-o
Some apple docs: https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/MachOTopics/0-Introduction/introduction.html I think these are the same as the pdf. Unfortunately a bit old and x86-centric
This doc is old but it says that only segments, not sections, need to be page-aligned: https://developer.apple.com/library/archive/documentation/Performance/Conceptual/CodeFootprint/Articles/MachOOverview.html
Nice docs on modifying a macho file https://lief.re/doc/latest/tutorials/11_macho_modification.html
Tried this machodump tool https://github.com/RedMapleTech/machodump
This is the macho reference: https://github.com/aidansteele/osx-abi-macho-file-format-reference
https://www.objc.io/issues/6-build-tools/mach-o-executables/
another good overview https://www.symbolcrash.com/2019/02/25/so-you-want-to-be-a-mach-o-man/
https://lowlevelbits.org/parsing-mach-o-files/
https://blog.xpnsec.com/building-a-mach-o-memory-loader-part-1/
https://github.com/opensource-apple/dyld/blob/master/src/ImageLoaderMachO.cpp

# Similar attempts
someone is similarly curious here https://stackoverflow.com/questions/68977603/handmade-macos-executable?rq=3
https://stackoverflow.com/questions/39863112/what-is-required-for-a-mach-o-executable-to-load
https://stackoverflow.com/questions/74659322/why-is-hello-world-in-assembly-for-arm-mac-invalid
https://codegolf.stackexchange.com/questions/102471/smallest-possible-runnable-mach-o-executable
https://stackoverflow.com/questions/71723764/why-does-macos-kill-static-executables-created-by-clang
https://seriot.ch/projects/hello_macho.html

# Mach-O Codesigning
nice read on syspolicyd https://knight.sc/reverse%20engineering/2019/02/20/syspolicyd-internals.html
https://github.com/nodejs/node/issues/40827 - # [Mac M1/Monterey SIGKILL with exit code 137 (Code Signature Invalid)](https://github.com/nodejs/node/issues/40827#top) #40827 - also arm
https://github.com/Homebrew/brew/issues/9082 for m1. "The linker will automatically apply one when a binary is created"
Good reference on the code signature https://hexiosec.com/blog/macho-files/
https://gregoryszorc.com/docs/apple-codesign/0.17.0/apple_codesign_gatekeeper.html

# Assembly and syscalls
more applet silicon assembly examples: https://github.com/jdshaffer/Apple-Silicon-ASM-Examples
Small executable from someone here: https://www.reddit.com/r/Assembly_language/comments/1ijt505/executables_smaller_than_33kb_possible_on_macos/
Explanation of syscalls here: https://stackoverflow.com/a/56993314
https://github.com/below/HelloSilicon/blob/main/Chapter%2001/HelloWorld.s - hellosilicon example of a small assembly program
Assmebly program for m1: https://stackoverflow.com/questions/69974380/how-to-compile-arm-assembly-on-an-m1-macbook
https://www.tiraniddo.dev/2010/06/quest-part-2.html?m=1

# Mach-O Builder Programs / Libraries
Check out line 660 https://llvm.org/doxygen/MachOWriter_8cpp_source.html#l00660
Could be another cool reference https://github.com/stek29/minmacho
https://gist.github.com/mszoek/2916926a57011bc369e0431561f3d5f7 - ravynOS macho loading
https://github.com/search?q=repo%3Abluewhalesystems%2Fsold%20codesignature&type=code Sold linker seems to have done it
macho writer in go by the author of the above https://github.com/Binject/debug/blob/master/macho/write.go

# Linkers and linking
Applet library primer (discusses the various apple linkers): https://developer.apple.com/forums/thread/715385
ld macos linker hell https://gist.github.com/loderunner/b6846dd82967ac048439
an interesting read about the introduction of stub libraries: https://developer.apple.com/forums/thread/655588?answerId=665804022#665804022
https://mjtsai.com/blog/2023/10/20/an-apple-library-primer/
https://stackoverflow.com/questions/65488856/how-to-print-all-symbols-that-a-mach-o-binary-imports-from-dylibs
This is very helpful to understand resolution of symbols https://adrummond.net/posts/macho
Inteseting discussion that I don't quite understand: https://stackoverflow.com/questions/8825537/mach-o-symbol-stubs-ios
This apple engineer tells us how to understand symbols! https://developer.apple.com/forums/thread/775650 - Understanding Mach-O symbols
This page is also fantastic: https://developer.apple.com/forums/thread/715385 - an apple library primer
This could be really good about symbols stubs. cmd F it: https://math-atlas.sourceforge.net/devel/assembly/MachORuntime.pdf
This explains some https://blog.1nf1n1ty.team/hacktricks/macos-hardening/macos-security-and-privilege-escalation/macos-proces-abuse/macos-library-injection/macos-dyld-process

