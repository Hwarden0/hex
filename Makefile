PREFIX ?= /usr/local
BINDIR  = $(PREFIX)/bin

install:
	@install -d $(BINDIR)
	@install -m 755 bin/hex $(BINDIR)/hex
	@echo "Installed: $(BINDIR)/hex"
	@hex --version

uninstall:
	@rm -f $(BINDIR)/hex
	@echo "Removed: $(BINDIR)/hex"
